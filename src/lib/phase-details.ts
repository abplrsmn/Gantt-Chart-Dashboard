export const PHASE_DETAIL_TYPES = ["text", "textarea", "date", "number", "currency", "percentage"] as const;
export type PhaseDetailType = typeof PHASE_DETAIL_TYPES[number];

export type PhaseDetail = {
  id: string;
  phaseId: string;
  phaseName: string;
  phaseCode: string;
  phaseOrder: number;
  key: string;
  label: string;
  type: PhaseDetailType;
  order: number;
  required: boolean;
  value: string | null;
};

export function isPhaseDetailType(value: unknown): value is PhaseDetailType {
  return typeof value === "string" && (PHASE_DETAIL_TYPES as readonly string[]).includes(value);
}

export function phaseDetailsJson(projectIdSql = "p.id"): string {
  return `
    COALESCE((
      SELECT json_agg(json_build_object(
        'id',        f.id::text,
        'phaseId',   f.phase_id::text,
        'phaseName', mp.phase_name,
        'phaseCode', mp.phase_code,
        'phaseOrder', mp.phase_order,
        'key',       f.field_key,
        'label',     f.field_label,
        'type',      f.field_type,
        'order',     f.field_order,
        'required',  f.is_required,
        'value',     v.value
      ) ORDER BY mp.phase_order, f.field_order, f.id)
      FROM master_phase_detail_fields f
      JOIN master_phases mp ON mp.id = f.phase_id
      LEFT JOIN project_phase_detail_values v
        ON v.field_id = f.id AND v.project_id = ${projectIdSql}
    ), '[]'::json) AS phase_details
  `;
}
