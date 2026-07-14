"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, X, FileSpreadsheet, Check, Loader2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportWeek = {
  week_date: string;
  plan_pct: number;
  actual_pct: number;
};

type ImportTask = {
  name: string;
  unit: string;
  vol: string;
  bobot: number;
  weeks: ImportWeek[];
};

type ImportStep = {
  letter: string;
  name: string;       // "A - PRELIMINARY"
  tasks: ImportTask[];
};

type ParsedData = {
  steps: ImportStep[];
  periodLabels: string[];
  warnings: string[];
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

const ID_MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3,
  mei: 4, may: 4, jun: 5, jul: 6,
  agu: 7, aug: 7, sep: 8, okt: 9, oct: 9,
  nov: 10, des: 11, dec: 11,
};

function parsePeriodDate(header: string, year: number, prevDate: Date | null): Date | null {
  if (!header || typeof header !== "string") return null;
  const clean = header.trim().toLowerCase();
  const m = clean.match(/^(\d+)[–\-](\d+)\s+([a-z]+)/);
  if (!m) return null;
  const startDay = parseInt(m[1]);
  const endDay   = parseInt(m[2]);
  const monthIdx = ID_MONTHS[m[3].slice(0, 3)];
  if (monthIdx === undefined) return null;
  if (startDay > endDay) {
    const pm = monthIdx === 0 ? 11 : monthIdx - 1;
    return new Date(monthIdx === 0 ? year - 1 : year, pm, startDay);
  }
  const useYear = prevDate && monthIdx < prevDate.getMonth() ? year + 1 : year;
  return new Date(useYear, monthIdx, startDay);
}

// Convert an Excel serial (days since 1899-12-30) to a LOCAL-midnight Date on the
// correct calendar day. We compute the UTC instant first (clean multiple of a day),
// then rebuild from its UTC Y/M/D so timezone never shifts the day.
function serialToLocalDate(serial: number): Date {
  const utc = new Date(Math.round((serial - 25569) * 86400000));
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

function parseDateCell(cell: unknown): Date | null {
  // SheetJS Date objects can carry sub-second drift (e.g. 23:59:48), which would
  // read as the previous day — round to the nearest local calendar day.
  if (cell instanceof Date && !isNaN(cell.getTime())) {
    const rounded = new Date(cell.getTime() + 12 * 3600 * 1000);
    return new Date(rounded.getFullYear(), rounded.getMonth(), rounded.getDate());
  }
  if (typeof cell === "number" && cell > 40000) return serialToLocalDate(cell);
  if (typeof cell === "string") {
    const d = new Date(cell);
    if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return null;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// ─── Excel parser ─────────────────────────────────────────────────────────────

const STOP_KEYWORDS = ["rencana", "realisasi", "kumulatif", "deviasi"];

function parseExcel(file: File, baseYear: number): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        // No cellDates → date cells arrive as raw serials, which we convert
        // timezone-safely (SheetJS Date objects can drift by ~12s and shift the day).
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
          header: 1, defval: null, raw: true,
        }) as unknown[][];

        const warnings: string[] = [];

        // ── Detect new format: find "BOBOT" column header anywhere ───────────
        let headerRowIdx = -1;
        let bobotCol = -1;

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r] as unknown[];
          for (let c = 0; c < row.length; c++) {
            if (String(row[c] ?? "").trim().toLowerCase() === "bobot") {
              headerRowIdx = r; bobotCol = c; break;
            }
          }
          if (headerRowIdx !== -1) break;
        }

        if (headerRowIdx !== -1) {
          // ── NEW FORMAT: TIME SCHEDULE style ───────────────────────────────
          const periodStartCol = bobotCol + 1;
          const headerRow = rows[headerRowIdx] as unknown[];
          const periodCount = headerRow.length - periodStartCol;

          const periodLabels = Array.from({ length: periodCount }, (_, i) =>
            String(headerRow[periodStartCol + i] ?? `P${i + 1}`).trim()
          );

          // Start dates from first row after header containing date values
          const periodDates: Date[] = [];
          for (let r = headerRowIdx + 1; r < Math.min(headerRowIdx + 6, rows.length); r++) {
            const row = rows[r] as unknown[];
            const first = parseDateCell(row[periodStartCol]);
            if (first) {
              for (let c = 0; c < periodCount; c++) {
                const d = parseDateCell(row[periodStartCol + c]);
                periodDates.push(d ?? new Date(first.getTime() + c * 7 * 86400000));
              }
              break;
            }
          }
          if (periodDates.length === 0) {
            const base = new Date(baseYear, 0, 1);
            for (let i = 0; i < periodCount; i++)
              periodDates.push(new Date(base.getTime() + i * 7 * 86400000));
            warnings.push("Period dates not found — using sequential dates.");
          }

          // Collect steps and their tasks
          type RawTask = { name: string; unit: string; vol: string; bobot: number; periods: number[] };
          type RawSection = { letter: string; name: string; tasks: RawTask[] };
          const sections: RawSection[] = [];
          const seenLetters = new Set<string>();
          let currentSection: RawSection | null = null;

          for (let r = headerRowIdx + 1; r < rows.length; r++) {
            const row = rows[r] as unknown[];
            const col0 = String(row[0] ?? "").trim();
            const col1 = String(row[1] ?? "").trim();
            const col2 = String(row[2] ?? "").trim();  // UNIT
            const col3 = String(row[3] ?? "").trim();  // VOL

            // Stop at RENCANA/REALISASI/KUMULATIF/DEVIASI summary rows
            if (STOP_KEYWORDS.some(kw => col0.toLowerCase().startsWith(kw))) break;

            const readPeriods = (): number[] =>
              Array.from({ length: periodCount }, (_, c) => {
                const v = Number(row[periodStartCol + c] ?? 0);
                return isNaN(v) ? 0 : v;
              });

            const bobot = (() => {
              const v = Number(row[bobotCol] ?? 0);
              return isNaN(v) ? 0 : v;
            })();

            const isLetter = /^[A-Z]$/.test(col0);
            const isNumber = /^\d+$/.test(col0);

            // Uppercase single letter → starts a new section (step)
            if (isLetter) {
              if (seenLetters.has(col0)) break; // second occurrence = separate table below
              seenLetters.add(col0);
              currentSection = { letter: col0, name: col1, tasks: [] };
              sections.push(currentSection);
            }

            // A row is a real TASK only when it carries its own weight (bobot > 0).
            //  - Section headers with bobot (A, M–Q): the header itself is the task.
            //  - Numbered items with bobot (B–L): each numbered item is a task.
            //  - bobot = 0 rows (spec sub-items, lowercase a/b/c, zero-weight numbers,
            //    SUB TOTAL rows) are skipped entirely.
            if ((isLetter || isNumber) && bobot > 0 && currentSection) {
              currentSection.tasks.push({
                name: col1 || col0,
                unit: isNumber ? col2 : "",
                vol: isNumber ? col3 : "",
                bobot,
                periods: readPeriods(),
              });
            }
          }

          if (sections.length === 0) {
            reject(new Error("No sections (A, B, C…) found. Make sure the Excel is in TIME SCHEDULE format."));
            return;
          }

          // Build ImportStep[] — the yellow per-period values are the weekly target
          // (rencana). They populate BOTH plan_pct (drives the PLANNED line) and
          // actual_pct (so the numbers appear in the editable weekly grid cells).
          const steps: ImportStep[] = sections
            .filter(sec => sec.tasks.length > 0)
            .map(sec => ({
              letter: sec.letter,
              name: `${sec.letter} - ${sec.name}`,
              tasks: sec.tasks.map(task => {
                const weeks: ImportWeek[] = [];
                for (let c = 0; c < periodCount; c++) {
                  // Store the full-precision value (like Excel) and let the grid
                  // display round to 2 decimals. The DB column is NUMERIC(9,5), so
                  // the weekly values still sum to 100% (rounding to 2dp at import
                  // dropped the cumulative to 99.92%).
                  const val = task.periods[c] ?? 0;
                  if (val > 0) {
                    weeks.push({ week_date: toISODate(periodDates[c]), plan_pct: val, actual_pct: val });
                  }
                }
                return { name: task.name, unit: task.unit, vol: task.vol, bobot: task.bobot, weeks };
              }),
            }));

          const grandTotal = steps.reduce((s, st) => s + st.tasks.reduce((ts, t) => ts + t.bobot, 0), 0);
          if (Math.abs(grandTotal - 100) > 1) {
            warnings.push(`Total weight ${grandTotal.toFixed(2)}% (not 100%) — double-check the BOBOT column in Excel.`);
          }

          resolve({ steps, periodLabels, warnings });
          return;
        }

        // ── OLD FORMAT: date-range strings in first 10 rows ──────────────────
        let dateRowIdx = -1;
        let dataColStart = 2;

        for (let r = 0; r < Math.min(10, rows.length); r++) {
          const row = rows[r] as unknown[];
          let cnt = 0;
          for (let c = 2; c < row.length; c++) {
            if (/\d+[-–]\d+\s+[a-zA-Z]+/.test(String(row[c] ?? "").trim())) cnt++;
          }
          if (cnt >= 2) {
            dateRowIdx = r;
            for (let c = 0; c < row.length; c++) {
              if (/\d+[-–]\d+\s+[a-zA-Z]+/.test(String(row[c] ?? "").trim())) { dataColStart = c; break; }
            }
            break;
          }
        }
        if (dateRowIdx === -1) { warnings.push("Date row not found — using column order."); dateRowIdx = 1; }

        const dateRow = (rows[dateRowIdx] ?? []) as unknown[];
        const oldDates: (Date | null)[] = [];
        let prevDate: Date | null = null;
        for (let c = dataColStart; c < dateRow.length; c++) {
          const d = parsePeriodDate(String(dateRow[c] ?? "").trim(), baseYear, prevDate);
          oldDates.push(d); if (d) prevDate = d;
        }
        let lastKnown: Date | null = null;
        for (let i = 0; i < oldDates.length; i++) {
          if (oldDates[i]) { lastKnown = oldDates[i]; continue; }
          if (lastKnown) { const next: Date = new Date(lastKnown); next.setDate(next.getDate() + 7); oldDates[i] = next; lastKnown = next; }
        }
        const periodLabelsOld = dateRow.slice(dataColStart).map(c => String(c ?? "").trim());

        let actualsRowOld: unknown[] | null = null;
        for (let r = rows.length - 1; r >= dateRowIdx + 1; r--) {
          const row = rows[r] as unknown[];
          if (String(row[0] ?? row[1] ?? "").trim().toLowerCase() === "bobot realisasi") { actualsRowOld = row; break; }
        }
        const actualsOld = oldDates.map((_, ci) => {
          if (!actualsRowOld) return 0;
          const v = Number(actualsRowOld[dataColStart + ci] ?? 0);
          return isNaN(v) ? 0 : v;
        });

        const SKIP_OLD = new Set(["bobot rencana", "bobot rencana kumulatif", "bobot realisasi kumulatif", "keterangan"]);
        type OldTask = { name: string; bobot: number; planned: number[] };
        const rawTasks: OldTask[] = [];
        const ppp: number[] = new Array(oldDates.length).fill(0);

        for (let r = dateRowIdx + 1; r < rows.length; r++) {
          const row = rows[r] as unknown[];
          const name = String(row[0] ?? row[1] ?? "").trim();
          if (!name) continue;
          const nl = name.toLowerCase();
          if (SKIP_OLD.has(nl) || /^tahap\s*\d+/i.test(name) || nl.startsWith("bobot")) continue;
          const bobot = Number(row[dataColStart - 1] ?? row[1] ?? null);
          if (isNaN(bobot) || bobot <= 0) continue;
          const planned = oldDates.map((_, ci) => { const v = Number(row[dataColStart + ci] ?? 0); return isNaN(v) ? 0 : v; });
          planned.forEach((v, ci) => { ppp[ci] += v; });
          rawTasks.push({ name, bobot, planned });
        }

        if (rawTasks.length === 0) { reject(new Error("No tasks found. Make sure the Excel format is correct.")); return; }

        const stepsOld: ImportStep[] = rawTasks.map((t, idx) => ({
          letter: LETTERS[Math.min(idx, 25)],
          name: t.name,
          tasks: [{
            name: t.name, unit: "", vol: "", bobot: t.bobot,
            weeks: oldDates.map((d, ci) => {
              const ta = actualsOld[ci]; const tp = ppp[ci];
              const actual = ta > 0 ? (tp > 0 ? parseFloat(((ta * t.planned[ci]) / tp).toFixed(4)) : parseFloat((ta / rawTasks.length).toFixed(4))) : 0;
              return { week_date: d ? toISODate(d) : toISODate(new Date(baseYear, 0, 1 + ci * 7)), plan_pct: t.planned[ci], actual_pct: actual };
            }).filter(w => w.plan_pct > 0 || w.actual_pct > 0),
          }],
        }));

        if (!actualsRowOld) warnings.push("'Bobot Realisasi' row not found — actual values will be 0.");
        resolve({ steps: stepsOld, periodLabels: periodLabelsOld, warnings });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  baseYear?: number;
  onImported: () => void;
  onClose: () => void;
}

export default function ScurveImportModal({ projectId, baseYear, onImported, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const year = baseYear ?? new Date().getFullYear();

  // Play the exit animation, then unmount (matches the Delete-project modal).
  function handleClose() {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => onClose(), 200);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name); setParseError(""); setParsed(null); setExpandedSteps(new Set());
    try {
      const result = await parseExcel(file, year);
      setParsed(result);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    }
    e.target.value = "";
  }

  async function handleImport() {
    if (!parsed) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scurve-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: parsed.steps }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Import failed");
      setDone(true);
      setTimeout(() => { setExiting(true); setTimeout(() => { onImported(); onClose(); }, 200); }, 1200);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  function toggleStep(letter: string) {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      next.has(letter) ? next.delete(letter) : next.add(letter);
      return next;
    });
  }

  const totalWeight = parsed?.steps.reduce((s, step) =>
    s + step.tasks.reduce((ts, t) => ts + t.bobot, 0), 0) ?? 0;

  const totalTasks = parsed?.steps.reduce((s, step) => s + step.tasks.length, 0) ?? 0;
  const activeTasks = parsed?.steps.reduce((s, step) => s + step.tasks.filter(t => t.bobot > 0).length, 0) ?? 0;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-9999 flex items-center justify-center p-4 ${exiting ? "animate-backdrop-exit" : "animate-backdrop-enter"}`}
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
      onMouseDown={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className={`bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl max-h-[90vh] flex flex-col ${exiting ? "animate-modal-exit" : "animate-modal-enter"}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={20} className="text-green-500" />
            <div>
              <h2 className="font-semibold text-slate-800 dark:text-white text-sm">Import S-Curve from Excel</h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Steps A–Q · Tasks with Unit & Vol · Plan & Actual</p>
            </div>
          </div>
          <button aria-label="Close" onClick={handleClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/6 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* Upload zone */}
          <div
            className="border-2 border-dashed border-slate-300 dark:border-white/15 rounded-xl p-8 text-center cursor-pointer hover:border-green-400 dark:hover:border-green-500 hover:bg-green-50/40 dark:hover:bg-green-950/20 transition-all"
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            <Upload size={28} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            {fileName ? (
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{fileName}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Click to choose an Excel file</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">.xlsx or .xls · Time Schedule format (BOBOT column, sections A–Q, unit & vol per task)</p>
              </>
            )}
          </div>

          {parseError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-[12px]">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />{parseError}
            </div>
          )}

          {parsed?.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-[12px]">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />{w}
            </div>
          ))}

          {/* Preview */}
          {parsed && (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Preview — {parsed.steps.length} steps · {activeTasks} active tasks · {totalTasks} total tasks · Weight {totalWeight.toFixed(2)}%
                  {Math.abs(totalWeight - 100) > 0.5 && <span className="ml-2 text-amber-500">(≠ 100%)</span>}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
                {parsed.steps.map((step) => {
                  const stepBobot = step.tasks.reduce((s, t) => s + t.bobot, 0);
                  const activePeriods = step.tasks.flatMap(t => t.weeks).filter(w => w.plan_pct > 0);
                  const hasActuals = step.tasks.some(t => t.weeks.some(w => w.actual_pct > 0));
                  const expanded = expandedSteps.has(step.letter);

                  return (
                    <div key={step.letter} className="border-b border-slate-100 dark:border-white/6 last:border-b-0">
                      {/* Step row */}
                      <button
                        onClick={() => toggleStep(step.letter)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/4 transition-colors"
                      >
                        {expanded ? <ChevronDown size={13} className="text-slate-400 shrink-0" /> : <ChevronRight size={13} className="text-slate-400 shrink-0" />}
                        <span className="w-6 text-[11px] font-bold text-slate-500 dark:text-slate-400">{step.letter}</span>
                        <span className="flex-1 text-[12px] font-semibold text-slate-700 dark:text-slate-200 truncate">{step.name.replace(/^[A-Z] - /, "")}</span>
                        <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400 w-16 text-right">{stepBobot.toFixed(2)}%</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 w-24 text-right">{step.tasks.filter(t => t.bobot > 0).length} active tasks</span>
                        {hasActuals && <span className="text-[10px] text-green-500 w-12 text-right">actual ✓</span>}
                        <span className="text-[10px] text-slate-300 dark:text-slate-600 w-20 text-right">{activePeriods.length} period entries</span>
                      </button>

                      {/* Expanded tasks */}
                      {expanded && (
                        <div className="bg-slate-50/50 dark:bg-zinc-950/30 border-t border-slate-100 dark:border-white/6">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="border-b border-slate-100 dark:border-white/6">
                                <th className="text-left px-8 py-1.5 font-semibold text-slate-400 dark:text-slate-500">Task</th>
                                <th className="text-center px-2 py-1.5 font-semibold text-slate-400 dark:text-slate-500 w-14">Unit</th>
                                <th className="text-center px-2 py-1.5 font-semibold text-slate-400 dark:text-slate-500 w-16">Vol</th>
                                <th className="text-right px-3 py-1.5 font-semibold text-slate-400 dark:text-slate-500 w-20">Weight (%)</th>
                                <th className="text-right px-3 py-1.5 font-semibold text-slate-400 dark:text-slate-500 w-24">Active Weeks</th>
                              </tr>
                            </thead>
                            <tbody>
                              {step.tasks.map((task, ti) => (
                                <tr key={ti} className="border-b border-slate-100 dark:border-white/4 last:border-b-0 hover:bg-slate-50 dark:hover:bg-white/3">
                                  <td className="px-8 py-1 text-slate-600 dark:text-slate-300">{task.name}</td>
                                  <td className="px-2 py-1 text-center text-slate-400 dark:text-slate-500">{task.unit || "—"}</td>
                                  <td className="px-2 py-1 text-center text-slate-400 dark:text-slate-500">{task.vol || "—"}</td>
                                  <td className={`px-3 py-1 text-right font-mono ${task.bobot > 0 ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-slate-300 dark:text-slate-600"}`}>
                                    {task.bobot > 0 ? task.bobot.toFixed(2) : "—"}
                                  </td>
                                  <td className="px-3 py-1 text-right text-slate-400 dark:text-slate-500">
                                    {task.weeks.length > 0 ? (
                                      <span>{task.weeks.length} weeks{task.weeks.some(w => w.actual_pct > 0) ? <span className="ml-1 text-green-500">+actual</span> : ""}</span>
                                    ) : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                Click a step to see its tasks · Blue = active weight · Green = has actual data · Import will <strong>replace</strong> all existing S-Curve data.
              </p>
            </div>
          )}

          {done && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-[12px]">
              <Check size={14} />Import successful! Reloading data...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-white/10">
          <button onClick={() => fileRef.current?.click()} className="text-[12px] text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            Change file
          </button>
          <div className="flex items-center gap-3">
            <button onClick={handleClose} className="px-4 py-2 rounded-lg text-[12px] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/6 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!parsed || importing || done}
              className="px-5 py-2 rounded-lg text-[12px] font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {importing ? <><Loader2 size={13} className="animate-spin" /> Importing…</> : done ? <><Check size={13} /> Done</> : "Import Now"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
