import type { PoolClient } from "pg";
import { getAuthUserFromCookie } from "@/lib/auth";

export type AuditLogEntry = {
  /** Null for actions that aren't tied to a single project (e.g. user accounts, master data). */
  projectId?: string | number | null;
  entityType: string;
  entityId?: string | number | null;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  changeSummary: string;
  changedByName: string;
  actionType: string;
};

export async function logChange(client: PoolClient, entry: AuditLogEntry): Promise<void> {
  await client.query(
    `INSERT INTO project_change_logs
       (project_id, entity_type, entity_id, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [
      entry.projectId ?? null,
      entry.entityType,
      entry.entityId ?? null,
      entry.fieldName ?? null,
      entry.oldValue ?? null,
      entry.newValue ?? null,
      entry.changeSummary,
      entry.changedByName,
      entry.actionType,
    ]
  );
}

/** Resolves the current request's actor name for audit entries; falls back to "Unknown". */
export async function getChangedByName(): Promise<string> {
  const user = await getAuthUserFromCookie();
  return user?.fullName ?? user?.email ?? "Unknown";
}
