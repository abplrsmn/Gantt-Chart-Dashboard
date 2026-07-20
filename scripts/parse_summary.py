#!/usr/bin/env python3
"""
Parse the SUMMARY sheet of "PROJECT REPORT 2026.xlsx" into structured project
records for import into the dashboard. READ-ONLY: writes only two artifacts next
to this script:
  - summary_import.json   (structured, consumed by import_summary.mjs)
  - summary_preview.csv   (flat, human-readable review sheet with a `flags` column)

Run:  python scripts/parse_summary.py [path-to-xlsx]
"""
import sys, os, json, csv, re
from datetime import datetime
import pandas as pd

DEFAULT_XLSX = r"C:\Users\abrah\OneDrive\Desktop\Work Stuff\PROJECT REPORT 2026.xlsx"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_JSON = os.path.join(HERE, "summary_import.json")
OUT_CSV  = os.path.join(HERE, "summary_preview.csv")

DATA_START = 6  # first data row index (0-based) in the SUMMARY sheet

# ── cleaning helpers ─────────────────────────────────────────────────────────
def clean_date(v):
    """Return (iso_or_None, leftover_text_or_None)."""
    if v is None:
        return None, None
    s = str(v).strip()
    if not s:
        return None, None
    # pandas parses real datetimes to 'YYYY-MM-DD 00:00:00'
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}", None
    # anything else is free text (?, initial, not required, cancelled, 2 Sept 2026, -)
    if s in ("-",):
        return None, None
    return None, s

def clean_money(v):
    if v is None:
        return None
    s = str(v).strip()
    digits = re.sub(r"[^\d]", "", s.split(".")[0])  # drop decimals + separators
    return int(digits) if digits else None

def clean_progress(v):
    if v is None:
        return None
    s = str(v).strip().replace("%", "").replace(",", ".").strip()
    if not s:
        return None
    try:
        f = float(s)
    except ValueError:
        return None
    if f <= 1:
        f *= 100
    return round(max(0.0, min(100.0, f)), 2)

def clean_int(v):
    if v is None:
        return None, None
    s = str(v).strip()
    if not s:
        return None, None
    m = re.match(r"^([+-]?\d+)$", s)
    if m:
        return int(m.group(1)), None
    return None, s  # e.g. "5 weeks" -> keep as note

def txt(v):
    s = "" if v is None else str(v).strip()
    return s or None

def clean_wd(v):
    """Working-drawing status is a text field, but the sheet sometimes stores a
    real date there — strip the leaked 'HH:MM:SS' so it reads as a plain date."""
    s = "" if v is None else str(v).strip()
    if not s:
        return None
    m = re.match(r"^(\d{4}-\d{2}-\d{2})[ T]\d{2}:\d{2}:\d{2}", s)
    return m.group(1) if m else s

# ── main parse ───────────────────────────────────────────────────────────────
def parse(xlsx_path):
    df = pd.read_excel(xlsx_path, sheet_name="SUMMARY", header=None, dtype=str).fillna("")
    n = len(df)

    # Group rows: an anchor row has a non-empty NO (col 1). Continuation rows
    # (blank NO) until the next anchor / unit change belong to the anchor.
    groups = []  # list of (unit, no, [row_indices])
    unit = ""
    cur = None
    for r in range(DATA_START, n):
        row = df.iloc[r]
        u = str(row[0]).strip()
        no = str(row[1]).strip()
        desc = str(row[2]).strip()
        if u:
            unit = u
        if no:
            cur = {"unit": unit, "no": no, "rows": [r]}
            groups.append(cur)
        else:
            # continuation only if there is *some* content and we have an anchor
            has_content = any(str(row[c]).strip() for c in range(2, 32))
            if cur is not None and has_content:
                cur["rows"].append(r)
            # blank spacer rows are ignored

    projects = []
    for g in groups:
        rows = [df.iloc[r] for r in g["rows"]]

        def first(col):
            """First non-empty value across the group's rows — used for DATES so a
            project's phase timeline can be completed from continuation rows."""
            for row in rows:
                s = str(row[col]).strip()
                if s:
                    return s
            return ""

        def anchor(col):
            """Value from the anchor (NO) row only — used for MONEY / PROGRESS /
            DURATION so bundled sub-item values don't leak into the parent total."""
            return str(rows[0][col]).strip()

        def all_text(col):
            """All distinct non-empty values for a column across the group's rows,
            in order — used for free-text fields (brief, capex request) where a
            continuation row can carry its OWN text rather than a duplicate/blank
            (e.g. SPH #1's second row has its own brief, not a repeat of the first).
            first()/anchor() would silently drop that second value."""
            seen = []
            for row in rows:
                s = str(row[col]).strip()
                if s and s not in seen:
                    seen.append(s)
            return seen

        # description = anchor desc; append continuation descriptions
        descs = [str(r[2]).strip() for r in rows if str(r[2]).strip()]
        project_name = descs[0] if descs else f"{g['unit']} #{g['no']}"
        extra_desc = descs[1:]

        flags = []
        if len(g["rows"]) > 1:
            flags.append(f"multi-row({len(g['rows'])})")

        # brief text (col3): combine every row's brief instead of only the first —
        # continuation rows often carry their own distinct brief line.
        briefs = all_text(3)
        brief = " | ".join(briefs) if briefs else ""
        note_bits = []
        if extra_desc:
            note_bits.append("Sub-items: " + " | ".join(extra_desc))

        # ── operational_brief ──
        recv_iso, recv_txt = clean_date(first(4))
        budget = clean_money(anchor(5))
        ob_notes = []
        if recv_txt:
            ob_notes.append(f"Receive date (raw): {recv_txt}")

        # ── design ──
        ds_start, ds_start_txt = clean_date(first(7))
        ds_tgt, _   = clean_date(first(8))
        ds_real, _  = clean_date(first(9))
        ds_dur, ds_dur_txt = clean_int(anchor(10))
        ds_brief = " | ".join(all_text(11))
        ds_wd = clean_wd(first(12))
        ds_notes = []
        for label, tv in (("start design (raw)", ds_start_txt), ("duration (raw)", ds_dur_txt)):
            if tv:
                ds_notes.append(f"{label}: {tv}")

        # ── project_control ──
        pc_start, _ = clean_date(first(14))
        pc_tgt, _   = clean_date(first(15))
        pc_real, _  = clean_date(first(16))
        pc_dur, pc_dur_txt = clean_int(anchor(17))
        pc_capexreq = " | ".join(all_text(18))
        pc_aps, _   = clean_date(first(19))
        pc_contract = clean_money(anchor(20))
        pc_notes = []
        if pc_capexreq:
            pc_notes.append(f"Capex request: {pc_capexreq}")
        if pc_dur_txt:
            pc_notes.append(f"duration (raw): {pc_dur_txt}")

        # ── project_management ──
        pm_start, _ = clean_date(first(23))
        pm_end, _   = clean_date(first(24))
        pm_actual, _ = clean_date(first(25))
        # col22/26/27 are project-level summary figures (like budget/progress),
        # not per-row detail — anchor-only so a bundled sub-row can't leak a
        # nonsense value in (this bit us once already: AMD #49's phantom 19B).
        pm_start_end_dev, _ = clean_int(anchor(22))   # "+/-" next to PROJECT start/end
        pm_dur_raw = anchor(26)                       # "duration month" — inconsistent units in the sheet (raw text kept, not parsed)
        pm_completion_dev = anchor(27) or None        # "+/-" next to COMPLETION real date — kept as raw text verbatim (may be "#VALUE!", "not required", etc.), not parsed to int
        pm_notes = []
        if pm_start_end_dev is not None:
            pm_notes.append(f"Start/End deviation: {pm_start_end_dev} days")
        if pm_dur_raw:
            pm_notes.append(f"Reported duration: {pm_dur_raw}")

        # ── handover ──
        hv1, _ = clean_date(first(30))
        hv2, _ = clean_date(first(31))

        # ── project-level derived ──
        progress = clean_progress(anchor(28))
        contract = pc_contract  # CONTRACT AMOUNT column
        all_dates = [d for d in (recv_iso, ds_start, ds_tgt, ds_real, pc_start, pc_tgt,
                                 pc_real, pc_aps, pm_start, pm_end, pm_actual, hv1, hv2) if d]
        start_date = min(all_dates) if all_dates else None
        end_date   = max(all_dates) if all_dates else None

        # current phase = furthest phase (5..1) that has any date
        phase_has = {
            5: any([hv1, hv2]),
            4: any([pm_start, pm_end, pm_actual]),
            3: any([pc_start, pc_tgt, pc_real, pc_aps]),
            2: any([ds_start, ds_tgt, ds_real]),
            1: any([recv_iso]),
        }
        current_phase_id = next((pid for pid in (5, 4, 3, 2, 1) if phase_has[pid]), 1)

        # flags
        low = (project_name + " " + brief + " " + " ".join(extra_desc)).lower()
        if any(w in low for w in ("cancel", "abort")):
            flags.append("cancelled/aborted")
        if anchor(28) and progress is None:
            flags.append(f"progress?({anchor(28)})")
        if recv_txt:
            flags.append(f"recv-date-text({recv_txt})")
        if not all_dates:
            flags.append("no-dates")

        phases = {
            "operational_brief": {
                "received_date": recv_iso, "budget_capex": budget,
                "brief_text": brief or None,
                "raw_deadline_text": recv_txt,
                "notes": " | ".join(ob_notes) or None,
            },
            "design": {
                "start_design_date": ds_start, "design_approval_target": ds_tgt,
                "design_approval_date": ds_real, "design_duration_days": ds_dur,
                "brief_text": ds_brief or None, "working_drawing_status": ds_wd or None,
                "notes": " | ".join(ds_notes) or None,
            },
            "project_control": {
                "tender_start_date": pc_start, "tender_finish_target": pc_tgt,
                "aps_spk_released_date": pc_real, "project_control_duration_days": pc_dur,
                "aps_date": pc_aps, "phase_contract_amount": pc_contract,
                "notes": " | ".join(pc_notes) or None,
            },
            "project_management": {
                "commence_date": pm_start, "end_contract_date": pm_end,
                "actual_phase_completion_date": pm_actual,
                "deviation_days": pm_completion_dev,
                "notes": " | ".join(pm_notes) or None,
            },
            "handover": {
                "bast_1_date": hv1, "bast_2_date": hv2, "notes": None,
            },
        }

        summary_brief_parts = [brief] if brief else []
        summary_brief_parts += note_bits
        summary_brief = " — ".join([p for p in summary_brief_parts if p]) or None

        projects.append({
            "unit": g["unit"], "no": g["no"],
            "project_name": project_name,
            "project_code": f"{g['unit'].replace(' ', '').replace('-', '')}-{g['no']}",
            "summary_brief": summary_brief,
            "contract_amount": contract,
            "overall_progress_pct": progress,
            "start_date": start_date, "end_date": end_date,
            "current_phase_id": current_phase_id,
            "phases": phases,
            "flags": flags,
            "src_rows": [int(r) for r in g["rows"]],
        })

    return projects

def write_outputs(projects):
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(projects, f, indent=2, ensure_ascii=False)

    cols = ["unit", "no", "project_name", "overall_progress_pct", "contract_amount",
            "current_phase_id", "start_date", "end_date", "flags"]
    with open(OUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(cols + ["brief"])
        for p in projects:
            w.writerow([
                p["unit"], p["no"], p["project_name"], p["overall_progress_pct"],
                p["contract_amount"], p["current_phase_id"], p["start_date"],
                p["end_date"], "; ".join(p["flags"]),
                (p["summary_brief"] or "")[:80],
            ])

def main():
    xlsx = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLSX
    projects = parse(xlsx)
    write_outputs(projects)
    units = sorted({p["unit"] for p in projects})
    flagged = [p for p in projects if p["flags"]]
    print(f"Parsed {len(projects)} projects across {len(units)} units.")
    print(f"Units: {', '.join(units)}")
    print(f"Flagged rows: {len(flagged)}")
    print(f"Wrote:\n  {OUT_JSON}\n  {OUT_CSV}")

if __name__ == "__main__":
    main()
