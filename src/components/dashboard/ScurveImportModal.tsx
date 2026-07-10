"use client";

import { useRef, useState } from "react";
import { Upload, X, FileSpreadsheet, Check, Loader2, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportWeek = {
  week_date: string;   // YYYY-MM-DD (Monday of the period)
  plan_pct: number;    // planned weight contribution this week
  actual_pct: number;  // actual weight contribution this week
};

type ImportStep = {
  letter: string;      // A, B, C…
  name: string;        // section title
  bobot: number;       // total weight %
  weeks: ImportWeek[];
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

function parseDateCell(cell: unknown): Date | null {
  if (cell instanceof Date && !isNaN(cell.getTime())) return cell;
  if (typeof cell === "number" && cell > 40000)
    return new Date(Math.round((cell - 25569) * 86400000));
  if (typeof cell === "string") {
    const d = new Date(cell);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// ─── Excel parser ─────────────────────────────────────────────────────────────

const SKIP_KEYWORDS = ["sub total", "total", "grand total", "rencana", "realisasi", "kumulatif", "deviasi"];

function parseExcel(file: File, baseYear: number): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
          header: 1, defval: null, raw: true,
        }) as unknown[][];

        const warnings: string[] = [];

        // ── Detect new format: find "BOBOT" column header ─────────────────────
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
          // ── NEW FORMAT: TIME SCHEDULE style → parse as A-Q steps ─────────
          const periodStartCol = bobotCol + 1;
          const headerRow = rows[headerRowIdx] as unknown[];
          const periodCount = headerRow.length - periodStartCol;

          const periodLabels = Array.from({ length: periodCount }, (_, i) =>
            String(headerRow[periodStartCol + i] ?? `P${i + 1}`).trim()
          );

          // Period start dates from first row after header containing date values
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
            warnings.push("Tanggal periode tidak ditemukan — pakai sequential dates.");
          }

          // Collect sections A-Q
          type Section = { name: string; bobot: number; periods: number[] };
          const sectionsMap = new Map<string, Section>();
          const sectionOrder: string[] = [];
          let currentLetter: string | null = null;

          for (let r = headerRowIdx + 1; r < rows.length; r++) {
            const row = rows[r] as unknown[];
            const col0 = String(row[0] ?? "").trim();
            const col1 = String(row[1] ?? "").trim();
            const col4 = String(row[4] ?? "").trim();

            // Stop at summary rows or duplicate section table
            const col0lower = col0.toLowerCase();
            if (SKIP_KEYWORDS.some(kw => col0lower.startsWith(kw))) break;

            // Uppercase single letter → new section
            if (/^[A-Z]$/.test(col0)) {
              if (sectionsMap.has(col0)) break; // second occurrence = separate table
              currentLetter = col0;
              sectionOrder.push(col0);
              const bobot = Number(row[bobotCol] ?? 0);
              const periods = Array.from({ length: periodCount }, (_, c) => {
                const v = Number(row[periodStartCol + c] ?? 0);
                return isNaN(v) ? 0 : v;
              });
              sectionsMap.set(col0, { name: col1 || col0, bobot: isNaN(bobot) ? 0 : bobot, periods });
            }

            // SUB TOTAL row → update bobot for that section
            if (col4.toUpperCase().startsWith("SUB TOTAL") && col4.length > 9) {
              const letter = col4.replace(/SUB TOTAL\s*/i, "").trim();
              const sec = sectionsMap.get(letter);
              if (sec) {
                const sb = Number(row[bobotCol] ?? 0);
                if (!isNaN(sb) && sb > 0) sec.bobot = sb;
              }
            }

            // Numbered or lowercase sub-item → accumulate period values into current section
            if (currentLetter && (/^\d+$/.test(col0) || /^[a-z]$/.test(col0))) {
              const sec = sectionsMap.get(currentLetter);
              if (sec) {
                for (let c = 0; c < periodCount; c++) {
                  const v = Number(row[periodStartCol + c] ?? 0);
                  if (!isNaN(v)) sec.periods[c] += v;
                }
              }
            }
          }

          // REALISASI actuals (per period, from bottom)
          const actualsPerPeriod: number[] = new Array(periodCount).fill(0);
          let foundActuals = false;
          for (let r = rows.length - 1; r >= headerRowIdx + 1; r--) {
            const row = rows[r] as unknown[];
            if (String(row[0] ?? "").trim().toLowerCase() === "realisasi") {
              for (let c = 0; c < periodCount; c++) {
                const v = Number(row[periodStartCol + c] ?? 0);
                actualsPerPeriod[c] = isNaN(v) ? 0 : v;
              }
              foundActuals = true;
              break;
            }
          }
          if (!foundActuals) warnings.push("Baris 'REALISASI' tidak ditemukan — actual values akan 0.");

          // Build steps
          const steps: ImportStep[] = [];
          const plannedPerPeriod: number[] = new Array(periodCount).fill(0);

          for (const letter of sectionOrder) {
            const sec = sectionsMap.get(letter)!;
            if (sec.bobot <= 0 && sec.periods.every(v => v === 0)) continue;
            for (let c = 0; c < periodCount; c++) plannedPerPeriod[c] += sec.periods[c];
            steps.push({
              letter,
              name: `${letter} - ${sec.name}`,
              bobot: sec.bobot,
              weeks: periodDates.map((d, ci) => ({
                week_date: toISODate(d),
                plan_pct: sec.periods[ci],
                actual_pct: 0,
              })),
            });
          }

          if (steps.length === 0) {
            reject(new Error("Tidak ada step yang ditemukan. Pastikan format Excel TIME SCHEDULE sudah benar."));
            return;
          }

          // Distribute REALISASI proportionally
          for (let ci = 0; ci < periodCount; ci++) {
            const totalActual = actualsPerPeriod[ci];
            if (totalActual === 0) continue;
            const totalPlanned = plannedPerPeriod[ci];
            for (const step of steps) {
              const w = step.weeks[ci];
              if (!w || totalPlanned === 0 || w.plan_pct === 0) continue;
              w.actual_pct = parseFloat(((totalActual * w.plan_pct) / totalPlanned).toFixed(4));
            }
          }

          resolve({ steps, periodLabels, warnings });
          return;
        }

        // ── OLD FORMAT: date-range strings in first 10 rows → steps ──────────
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
        if (dateRowIdx === -1) { warnings.push("Tidak menemukan baris tanggal — pakai urutan kolom."); dateRowIdx = 1; }

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
        const rawTasks: { name: string; bobot: number; planned: number[] }[] = [];
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

        if (rawTasks.length === 0) { reject(new Error("Tidak ada task yang ditemukan. Pastikan format Excel sesuai.")); return; }

        const steps: ImportStep[] = rawTasks.map((t, idx) => ({
          letter: LETTERS[Math.min(idx, 25)],
          name: t.name,
          bobot: t.bobot,
          weeks: oldDates.map((d, ci) => ({
            week_date: d ? toISODate(d) : toISODate(new Date(baseYear, 0, 1 + ci * 7)),
            plan_pct: t.planned[ci],
            actual_pct: 0,
          })),
        }));

        // Distribute actuals
        for (let ci = 0; ci < oldDates.length; ci++) {
          const ta = actualsOld[ci]; if (ta === 0) continue;
          for (let si = 0; si < steps.length; si++) {
            const w = steps[si].weeks[ci]; if (!w) continue;
            const tp = ppp[ci];
            if (tp > 0 && w.plan_pct > 0) w.actual_pct = parseFloat(((ta * w.plan_pct) / tp).toFixed(4));
            else if (tp === 0) w.actual_pct = parseFloat((ta / steps.length).toFixed(4));
          }
        }

        if (!actualsRowOld) warnings.push("Baris 'Bobot Realisasi' tidak ditemukan — actual values akan 0.");
        resolve({ steps, periodLabels: periodLabelsOld, warnings });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Gagal membaca file"));
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
  const year = baseYear ?? new Date().getFullYear();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name); setParseError(""); setParsed(null);
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
      if (!json.success) throw new Error(json.error ?? "Import gagal");
      setDone(true);
      setTimeout(() => { onImported(); onClose(); }, 1200);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  const totalWeight = parsed?.steps.reduce((s, t) => s + t.bobot, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={20} className="text-green-500" />
            <div>
              <h2 className="font-semibold text-slate-800 dark:text-white text-sm">Import S-Curve dari Excel</h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Steps (A, B, C…) + Bobot Rencana & Realisasi</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/6 transition-colors">
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
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Klik untuk pilih file Excel</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">.xlsx atau .xls · Format Time Schedule (kolom BOBOT, sections A–Q) atau format periode (M1/M2…)</p>
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
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Preview — {parsed.steps.length} steps · Total bobot {totalWeight.toFixed(2)}%
                {Math.abs(totalWeight - 100) > 0.5 && <span className="ml-2 text-amber-500">(≠ 100%)</span>}
              </p>
              <div className="overflow-auto rounded-xl border border-slate-200 dark:border-white/10 max-h-72">
                <table className="w-full text-[11px] border-separate border-spacing-0">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-zinc-800">
                    <tr>
                      <th className="text-left px-3 py-2 border-b border-slate-200 dark:border-white/10 font-semibold text-slate-600 dark:text-slate-300 min-w-48">Step</th>
                      <th className="text-right px-3 py-2 border-b border-slate-200 dark:border-white/10 font-semibold text-slate-600 dark:text-slate-300 w-20">Bobot (%)</th>
                      {parsed.periodLabels.slice(0, 13).map((l, i) => (
                        <th key={i} className="text-right px-2 py-2 border-b border-slate-200 dark:border-white/10 font-semibold text-slate-500 dark:text-slate-400 w-16 whitespace-nowrap">{l || `P${i + 1}`}</th>
                      ))}
                      {parsed.periodLabels.length > 13 && <th className="text-right px-2 py-2 border-b border-slate-200 dark:border-white/10 text-slate-400">+{parsed.periodLabels.length - 13} lagi</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.steps.map((step, si) => (
                      <tr key={si} className="odd:bg-white even:bg-slate-50 dark:odd:bg-zinc-950 dark:even:bg-zinc-900">
                        <td className="px-3 py-1.5 border-b border-slate-100 dark:border-white/6 text-slate-700 dark:text-slate-200 font-medium">{step.name}</td>
                        <td className="px-3 py-1.5 border-b border-slate-100 dark:border-white/6 text-right font-mono text-slate-700 dark:text-slate-200">{step.bobot.toFixed(2)}</td>
                        {step.weeks.slice(0, 13).map((w, wi) => (
                          <td key={wi} className="px-2 py-1.5 border-b border-slate-100 dark:border-white/6 text-right font-mono text-slate-500 dark:text-slate-400">
                            {w.plan_pct > 0 ? <span className="text-blue-600 dark:text-blue-400">{w.plan_pct.toFixed(2)}</span> : "·"}
                            {w.actual_pct > 0 && <span className="block text-[9px] text-green-600 dark:text-green-400">{w.actual_pct.toFixed(2)}</span>}
                          </td>
                        ))}
                        {step.weeks.length > 13 && <td className="px-2 py-1.5 border-b border-slate-100 dark:border-white/6 text-slate-300 text-center">…</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                Biru = planned · Hijau (kecil) = actual · Import akan <strong>mengganti</strong> semua data S-Curve yang ada.
              </p>
            </div>
          )}

          {done && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-[12px]">
              <Check size={14} />Import berhasil! Memuat ulang data...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-white/10">
          <button onClick={() => fileRef.current?.click()} className="text-[12px] text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            Ganti file
          </button>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-[12px] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/6 transition-colors">
              Batal
            </button>
            <button
              onClick={handleImport}
              disabled={!parsed || importing || done}
              className="px-5 py-2 rounded-lg text-[12px] font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {importing ? <><Loader2 size={13} className="animate-spin" /> Mengimpor…</> : done ? <><Check size={13} /> Selesai</> : "Import Sekarang"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
