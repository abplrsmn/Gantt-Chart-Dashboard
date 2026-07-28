"use client";

import { useEffect, useState } from "react";
import { PHASE_LIST, DEFAULT_PHASE_COLOR } from "./phases";

/** A phase as configured in Master Setup — order and color are DB-driven. */
export type DbPhase = {
  id: string;
  phase_code: string;
  phase_name: string;
  phase_order: number;
  color: string | null;
};

/** Normalised shape the dashboard/Gantt render from. */
export type ResolvedPhase = {
  id: string;
  code: string;
  label: string;
  color: string;
  order: number;
};

/** Fallback used before the fetch resolves (or if it fails) — the built-in five. */
const FALLBACK: ResolvedPhase[] = PHASE_LIST.map((p, i) => ({
  id: String(i + 1),
  code: p.code,
  label: p.label,
  color: p.color,
  order: i + 1,
}));

/**
 * Loads the phase pipeline (order + color + label) from Master Setup.
 *
 * Phase order and color used to be hardcoded in `phases.ts`; they're now
 * editable, so anything that renders phases should read them from here to stay
 * in sync. Falls back to the built-in five so a failed request never renders an
 * empty board.
 */
export function usePhases(): { phases: ResolvedPhase[]; loading: boolean } {
  const [phases, setPhases] = useState<ResolvedPhase[]>(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/master/phases", { cache: "no-store" })
      .then(r => r.json())
      .then((j: { success?: boolean; data?: DbPhase[] }) => {
        if (cancelled || !j.success || !Array.isArray(j.data) || j.data.length === 0) return;
        setPhases(
          j.data
            .slice()
            .sort((a, b) => a.phase_order - b.phase_order)
            .map(p => ({
              id: String(p.id),
              code: p.phase_code,
              label: p.phase_name,
              color: p.color || DEFAULT_PHASE_COLOR,
              order: p.phase_order,
            }))
        );
      })
      .catch(() => { /* keep the fallback */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { phases, loading };
}
