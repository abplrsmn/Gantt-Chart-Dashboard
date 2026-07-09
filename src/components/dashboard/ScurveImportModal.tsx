"use client";

import { useRef, useState } from "react";
import { Upload, X, FileSpreadsheet, Check, Loader2, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportPeriod = {
  period_order: number;
  period_start: string;
  planned_weight: number;
  actual_weight: number;
};

type ImportTask = {
  title: string;
  weight_pct: number;
  periods: ImportPeriod[];
};

type ParsedData = {
  tasks: ImportTask[];
  periodLabels: string[];
  warnings: string[];
};

// ─── Date parsing ─────────────────────────────────────────────────────────────

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
  const endDay = parseInt(m[2]);
  const monthKey = m[3].slice(0, 3);
  const monthIdx = ID_MONTHS[monthKey];
  if (monthIdx === undefined) return null;
  if (startDay > endDay) {
    const prevMonth = monthIdx === 0 ? 11 : monthIdx - 1;
    const prevYear = monthIdx === 0 ? year - 1 : year;
    return new Date(prevYear, prevMonth, startDay);
  }
  const useYear = prevDate && monthIdx < prevDate.getMonth() ? year + 1 : year;
  return new Date(useYear, monthIdx, startDay);
}

function parseDateCell(cell: unknown): Date | null {
  if (cell instanceof Date && !isNaN(cell.getTime())) return cell;
  // Excel date serial (days since 1900-01-01, with 1900 leap-year bug offset)
  if (typeof cell === "number" && cell > 40000) {
    return new Date(Math.round((cell - 25569) * 86400000));
  }
  if (typeof cell === "string") {
    const d = new Date(cell);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Excel parser ─────────────────────────────────────────────────────────────

const SKIP_KEYWORDS_NEW = ["sub total", "total", "grand total", "rencana", "realisasi", "kumulatif"];

const SKIP_TITLES_OLD = new Set([
  "bobot rencana", "bobot rencana kumulatif",
  "bobot realisasi kumulatif", "keterangan",
]);

function parseExcel(file: File, baseYear: number): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        // cellDates: true → date cells come as JS Date objects (not serial numbers)
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          defval: null,
          raw: true,
        }) as unknown[][];

        const warnings: string[] = [];

        // ── Detect new format: find any row with a cell exactly equal to "BOBOT" ──
        let headerRowIdx = -1;
        let bobotCol = -1;

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r] as unknown[];
          for (let c = 0; c < row.length; c++) {
            if (String(row[c] ?? "").trim().toLowerCase() === "bobot") {
              headerRowIdx = r;
              bobotCol = c;
              break;
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

          // Start dates: first row after header where period cols contain dates
          const periodDates: Date[] = [];
          for (let r = headerRowIdx + 1; r < Math.min(headerRowIdx + 6, rows.length); r++) {
            const row = rows[r] as unknown[];
            const firstDate = parseDateCell(row[periodStartCol]);
            if (firstDate) {
              for (let c = 0; c < periodCount; c++) {
                const d = parseDateCell(row[periodStartCol + c]);
                periodDates.push(d ?? new Date(firstDate.getTime() + c * 7 * 86400000));
              }
              break;
            }
          }

          if (periodDates.length === 0) {
            const base = new Date(baseYear, 0, 1);
            for (let i = 0; i < periodCount; i++) periodDates.push(new Date(base.getTime() + i * 7 * 86400000));
            warnings.push("Tanggal periode tidak ditemukan — pakai sequential dates.");
          }

          // REALISASI row: scan from bottom, find col0 === "realisasi"
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

          // Task rows
          const tasks: ImportTask[] = [];
          const plannedPerPeriod: number[] = new Array(periodCount).fill(0);

          for (let r = headerRowIdx + 1; r < rows.length; r++) {
            const row = rows[r] as unknown[];
            const col0 = String(row[0] ?? "").trim();
            const col1 = String(row[1] ?? "").trim();
            const col2 = String(row[2] ?? "").trim();

            if (!col0 && !col1) continue;

            const combined = (col0 + " " + col1 + " " + col2).toLowerCase();
            if (SKIP_KEYWORDS_NEW.some(kw => combined.includes(kw))) continue;

            const bobot = Number(row[bobotCol] ?? 0);
            if (isNaN(bobot) || bobot <= 0) continue;

            const title = col1 || col0;
            const planned: number[] = [];
            for (let c = 0; c < periodCount; c++) {
              const v = Number(row[periodStartCol + c] ?? 0);
              const safe = isNaN(v) ? 0 : v;
              planned.push(safe);
              plannedPerPeriod[c] += safe;
            }

            tasks.push({
              title,
              weight_pct: bobot,
              periods: periodDates.map((d, ci) => ({
                period_order: ci + 1,
                period_start: toISODate(d),
                planned_weight: planned[ci],
                actual_weight: 0,
              })),
            });
          }

          if (tasks.length === 0) {
            reject(new Error("Tidak ada task yang ditemukan. Pastikan kolom BOBOT ada dan bernilai > 0."));
            return;
          }

          // Distribute actuals proportionally
          for (let ci = 0; ci < periodCount; ci++) {
            const totalActual = actualsPerPeriod[ci];
            if (totalActual === 0) continue;
            const totalPlanned = plannedPerPeriod[ci];
            for (const task of tasks) {
              const p = task.periods[ci];
              if (!p || totalPlanned === 0 || p.planned_weight === 0) continue;
              p.actual_weight = parseFloat(((totalActual * p.planned_weight) / totalPlanned).toFixed(4));
            }
          }

          resolve({ tasks, periodLabels, warnings });
          return;
        }

        // ── OLD FORMAT: date-range strings in first 10 rows ──────────────────
        let dateRowIdx = -1;
        let dataColStart = 2;

        for (let r = 0; r < Math.min(10, rows.length); r++) {
          const row = rows[r] as unknown[];
          let dateColCount = 0;
          for (let c = 2; c < row.length; c++) {
            const cell = String(row[c] ?? "").trim();
            if (/\d+[-–]\d+\s+[a-zA-Z]+/.test(cell)) dateColCount++;
          }
          if (dateColCount >= 2) {
            dateRowIdx = r;
            for (let c = 0; c < row.length; c++) {
              if (/\d+[-–]\d+\s+[a-zA-Z]+/.test(String(row[c] ?? "").trim())) {
                dataColStart = c;
                break;
              }
            }
            break;
          }
        }

        if (dateRowIdx === -1) {
          warnings.push("Tidak menemukan baris tanggal — pakai urutan kolom sebagai periode.");
          dateRowIdx = 1;
        }

        const dateRow = (rows[dateRowIdx] ?? []) as unknown[];
        const periodDatesOld: (Date | null)[] = [];
        let prevDate: Date | null = null;

        for (let c = dataColStart; c < dateRow.length; c++) {
          const cell = String(dateRow[c] ?? "").trim();
          const d = parsePeriodDate(cell, baseYear, prevDate);
          periodDatesOld.push(d);
          if (d) prevDate = d;
        }

        let lastKnown: Date | null = null;
        for (let i = 0; i < periodDatesOld.length; i++) {
          if (periodDatesOld[i]) { lastKnown = periodDatesOld[i]; continue; }
          if (lastKnown) {
            const next: Date = new Date(lastKnown);
            next.setDate(next.getDate() + 7);
            periodDatesOld[i] = next;
            lastKnown = next;
          }
        }

        const periodLabels = dateRow.slice(dataColStart).map(c => String(c ?? "").trim());

        let actualsRow: unknown[] | null = null;
        for (let r = rows.length - 1; r >= dateRowIdx + 1; r--) {
          const row = rows[r] as unknown[];
          const title = String(row[0] ?? row[1] ?? "").trim().toLowerCase();
          if (title === "bobot realisasi") { actualsRow = row; break; }
        }

        const actualsPerPeriodOld: number[] = periodDatesOld.map((_, ci) => {
          if (!actualsRow) return 0;
          const v = Number(actualsRow[dataColStart + ci] ?? 0);
          return isNaN(v) ? 0 : v;
        });

        const tasks: ImportTask[] = [];
        const plannedPerPeriodOld: number[] = new Array(periodDatesOld.length).fill(0);

        for (let r = dateRowIdx + 1; r < rows.length; r++) {
          const row = rows[r] as unknown[];
          const nameRaw = String(row[0] ?? row[1] ?? "").trim();
          if (!nameRaw) continue;
          const nameLower = nameRaw.toLowerCase();
          if (SKIP_TITLES_OLD.has(nameLower)) continue;
          if (/^tahap\s*\d+/i.test(nameRaw) || nameLower.startsWith("bobot")) continue;

          const bobot = Number(row[dataColStart - 1] ?? row[1] ?? null);
          if (isNaN(bobot) || bobot <= 0) continue;

          const planned: number[] = periodDatesOld.map((_, ci) => {
            const v = Number(row[dataColStart + ci] ?? 0);
            return isNaN(v) ? 0 : v;
          });
          planned.forEach((v, ci) => { plannedPerPeriodOld[ci] += v; });

          tasks.push({
            title: nameRaw,
            weight_pct: bobot,
            periods: periodDatesOld.map((d, ci) => ({
              period_order: ci + 1,
              period_start: d ? toISODate(d) : toISODate(new Date(baseYear, 0, 1 + ci * 7)),
              planned_weight: planned[ci],
              actual_weight: 0,
            })),
          });
        }

        if (tasks.length === 0) {
          reject(new Error("Tidak ada task yang ditemukan. Pastikan format Excel sesuai."));
          return;
        }

        for (let ci = 0; ci < periodDatesOld.length; ci++) {
          const totalActual = actualsPerPeriodOld[ci];
          if (totalActual === 0) continue;
          const totalPlanned = plannedPerPeriodOld[ci];
          for (const task of tasks) {
            const p = task.periods[ci];
            if (!p) continue;
            if (totalPlanned > 0 && p.planned_weight > 0) {
              p.actual_weight = parseFloat(((totalActual * p.planned_weight) / totalPlanned).toFixed(4));
            } else if (totalPlanned === 0) {
              p.actual_weight = parseFloat((totalActual / tasks.length).toFixed(4));
            }
          }
        }

        if (!actualsRow) warnings.push("Baris 'Bobot Realisasi' tidak ditemukan — actual values akan 0.");

        resolve({ tasks, periodLabels, warnings });
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
    setFileName(file.name);
    setParseError("");
    setParsed(null);
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
        body: JSON.stringify({ tasks: parsed.tasks }),
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

  const totalWeight = parsed?.tasks.reduce((s, t) => s + t.weight_pct, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={20} className="text-green-500" />
            <div>
              <h2 className="font-semibold text-slate-800 dark:text-white text-sm">Import S-Curve dari Excel</h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Bobot Rencana + Bobot Realisasi</p>
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
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">.xlsx atau .xls · Format Time Schedule (kolom BOBOT) atau format periode (M1/M2...)</p>
              </>
            )}
          </div>

          {/* Parse error */}
          {parseError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-[12px]">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              {parseError}
            </div>
          )}

          {/* Warnings */}
          {parsed?.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-[12px]">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              {w}
            </div>
          ))}

          {/* Preview table */}
          {parsed && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Preview — {parsed.tasks.length} tasks · Total bobot {totalWeight.toFixed(2)}%
                  {Math.abs(totalWeight - 100) > 0.5 && (
                    <span className="ml-2 text-amber-500">(≠ 100%)</span>
                  )}
                </p>
              </div>
              <div className="overflow-auto rounded-xl border border-slate-200 dark:border-white/10 max-h-72">
                <table className="w-full text-[11px] border-separate border-spacing-0">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-zinc-800">
                    <tr>
                      <th className="text-left px-3 py-2 border-b border-slate-200 dark:border-white/10 font-semibold text-slate-600 dark:text-slate-300 min-w-48">Keterangan</th>
                      <th className="text-right px-3 py-2 border-b border-slate-200 dark:border-white/10 font-semibold text-slate-600 dark:text-slate-300 w-20">Bobot (%)</th>
                      {parsed.periodLabels.slice(0, 12).map((l, i) => (
                        <th key={i} className="text-right px-2 py-2 border-b border-slate-200 dark:border-white/10 font-semibold text-slate-500 dark:text-slate-400 w-20 whitespace-nowrap">{l || `P${i + 1}`}</th>
                      ))}
                      {parsed.periodLabels.length > 12 && (
                        <th className="text-right px-2 py-2 border-b border-slate-200 dark:border-white/10 text-slate-400">+{parsed.periodLabels.length - 12} lagi</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.tasks.map((task, ti) => (
                      <tr key={ti} className="odd:bg-white even:bg-slate-50 dark:odd:bg-zinc-950 dark:even:bg-zinc-900">
                        <td className="px-3 py-1.5 border-b border-slate-100 dark:border-white/6 text-slate-700 dark:text-slate-200 font-medium">{task.title}</td>
                        <td className="px-3 py-1.5 border-b border-slate-100 dark:border-white/6 text-right font-mono text-slate-700 dark:text-slate-200">{task.weight_pct}</td>
                        {task.periods.slice(0, 12).map((p, pi) => (
                          <td key={pi} className="px-2 py-1.5 border-b border-slate-100 dark:border-white/6 text-right font-mono text-slate-500 dark:text-slate-400">
                            {p.planned_weight > 0 ? (
                              <span className="text-blue-600 dark:text-blue-400">{p.planned_weight}</span>
                            ) : "·"}
                            {p.actual_weight > 0 && (
                              <span className="block text-[9px] text-green-600 dark:text-green-400">{p.actual_weight.toFixed(2)}</span>
                            )}
                          </td>
                        ))}
                        {task.periods.length > 12 && <td className="px-2 py-1.5 border-b border-slate-100 dark:border-white/6 text-slate-300 text-center">…</td>}
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
              <Check size={14} />
              Import berhasil! Memuat ulang data...
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
              {importing ? <><Loader2 size={13} className="animate-spin" /> Mengimpor...</> : done ? <><Check size={13} /> Selesai</> : "Import Sekarang"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
