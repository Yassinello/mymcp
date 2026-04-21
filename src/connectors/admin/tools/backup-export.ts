import { exportBackup } from "@/core/backup";
import { getContextKVStore } from "@/core/request-context";

export const backupExportSchema = {};

export async function handleBackupExport() {
  // Phase 42 / TEN-04: default scope is the current tenant's
  // namespace. Passing the tenant KV explicitly keeps the behaviour
  // identical to the default path and makes the intent explicit for
  // readers migrating from pre-v0.11 call shapes.
  const data = await exportBackup({ kv: getContextKVStore() });
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}
