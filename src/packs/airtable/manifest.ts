import type { PackManifest } from "@/core/types";
import { airtableRequest } from "./lib/airtable-api";
import { airtableListBasesSchema, handleAirtableListBases } from "./tools/airtable_list_bases";
import { airtableListTablesSchema, handleAirtableListTables } from "./tools/airtable_list_tables";
import {
  airtableListRecordsSchema,
  handleAirtableListRecords,
} from "./tools/airtable_list_records";
import { airtableGetRecordSchema, handleAirtableGetRecord } from "./tools/airtable_get_record";
import {
  airtableCreateRecordSchema,
  handleAirtableCreateRecord,
} from "./tools/airtable_create_record";
import {
  airtableUpdateRecordSchema,
  handleAirtableUpdateRecord,
} from "./tools/airtable_update_record";
import {
  airtableSearchRecordsSchema,
  handleAirtableSearchRecords,
} from "./tools/airtable_search_records";

interface BasesResponse {
  bases: Array<{ id: string; name: string }>;
}

export const airtablePack: PackManifest = {
  id: "airtable",
  label: "Airtable",
  description: "List, read, create, update, and search records across Airtable bases and tables",
  requiredEnvVars: ["AIRTABLE_API_KEY"],
  diagnose: async () => {
    try {
      const data = await airtableRequest<BasesResponse>("/meta/bases");
      return { ok: true, message: `Connected — ${data.bases.length} accessible base(s)` };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Cannot reach Airtable API",
      };
    }
  },
  tools: [
    {
      name: "airtable_list_bases",
      description:
        "List all Airtable bases accessible with the current API key, including IDs and permission levels.",
      schema: airtableListBasesSchema,
      handler: async (params) => handleAirtableListBases(params as Record<string, unknown>),
    },
    {
      name: "airtable_list_tables",
      description: "List all tables in an Airtable base, including fields and views.",
      schema: airtableListTablesSchema,
      handler: async (params) => handleAirtableListTables(params as { base_id: string }),
    },
    {
      name: "airtable_list_records",
      description:
        "List records in an Airtable table. Supports optional view, filter formula, sort, and limit (default 25, max 100).",
      schema: airtableListRecordsSchema,
      handler: async (params) =>
        handleAirtableListRecords(
          params as {
            base_id: string;
            table: string;
            view?: string;
            filter_formula?: string;
            sort_field?: string;
            sort_direction?: "asc" | "desc";
            limit?: number;
          }
        ),
    },
    {
      name: "airtable_get_record",
      description: "Get a single Airtable record by ID with all its field values.",
      schema: airtableGetRecordSchema,
      handler: async (params) =>
        handleAirtableGetRecord(params as { base_id: string; table: string; record_id: string }),
    },
    {
      name: "airtable_create_record",
      description:
        "Create a new record in an Airtable table. Always confirm field values with the user before calling.",
      schema: airtableCreateRecordSchema,
      handler: async (params) =>
        handleAirtableCreateRecord(
          params as { base_id: string; table: string; fields: Record<string, unknown> }
        ),
      destructive: true,
    },
    {
      name: "airtable_update_record",
      description:
        "Partially update an existing Airtable record (PATCH — untouched fields are preserved). Always confirm changes with the user before calling.",
      schema: airtableUpdateRecordSchema,
      handler: async (params) =>
        handleAirtableUpdateRecord(
          params as {
            base_id: string;
            table: string;
            record_id: string;
            fields: Record<string, unknown>;
          }
        ),
      destructive: true,
    },
    {
      name: "airtable_search_records",
      description:
        "Search records in an Airtable table using a case-insensitive text match on a specified field.",
      schema: airtableSearchRecordsSchema,
      handler: async (params) =>
        handleAirtableSearchRecords(
          params as {
            base_id: string;
            table: string;
            search_field: string;
            query: string;
            limit?: number;
          }
        ),
    },
  ],
};
