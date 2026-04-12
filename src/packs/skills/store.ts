import { promises as fs, readFileSync } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { z } from "zod";

/**
 * Skills store — JSON file, single source of truth for user-authored skills.
 *
 * Path is configurable via MYMCP_SKILLS_PATH (default: ./data/skills.json).
 * Atomic writes via tmp + rename. Parent dir is auto-created.
 */

export const skillArgumentSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "arg name must be a valid identifier"),
  description: z.string().optional().default(""),
  required: z.boolean().optional().default(false),
});

export const skillSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("inline"),
  }),
  z.object({
    type: z.literal("remote"),
    url: z.string().url(),
    cachedContent: z.string().optional(),
    cachedAt: z.string().optional(),
    lastError: z.string().optional(),
  }),
]);

export const skillSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, "id must be slug-safe: [a-z0-9_]"),
  name: z.string().min(1),
  description: z.string().default(""),
  content: z.string().default(""),
  arguments: z.array(skillArgumentSchema).default([]),
  source: skillSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SkillArgument = z.infer<typeof skillArgumentSchema>;
export type SkillSource = z.infer<typeof skillSourceSchema>;
export type Skill = z.infer<typeof skillSchema>;

export const skillCreateInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  content: z.string().default(""),
  arguments: z.array(skillArgumentSchema).default([]),
  source: skillSourceSchema,
});

export const skillUpdateInputSchema = skillCreateInputSchema.partial();

export type SkillCreateInput = z.infer<typeof skillCreateInputSchema>;
export type SkillUpdateInput = z.infer<typeof skillUpdateInputSchema>;

// ── Paths ───────────────────────────────────────────────────────────────

function getSkillsPath(): string {
  const override = process.env.MYMCP_SKILLS_PATH?.trim();
  if (override) return path.resolve(override);
  return path.resolve(process.cwd(), "data", "skills.json");
}

async function ensureDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

// ── Slug generation ─────────────────────────────────────────────────────

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return base || `skill_${randomBytes(3).toString("hex")}`;
}

async function uniqueId(base: string, existing: Set<string>): Promise<string> {
  if (!existing.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}_${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}_${randomBytes(3).toString("hex")}`;
}

// ── Raw file I/O (atomic) ───────────────────────────────────────────────

async function readRaw(): Promise<Skill[]> {
  const p = getSkillsPath();
  try {
    const buf = await fs.readFile(p, "utf-8");
    const parsed = JSON.parse(buf);
    if (!Array.isArray(parsed)) return [];
    const out: Skill[] = [];
    for (const row of parsed) {
      const res = skillSchema.safeParse(row);
      if (res.success) out.push(res.data);
    }
    return out;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeRaw(skills: Skill[]): Promise<void> {
  const p = getSkillsPath();
  await ensureDir(p);
  const tmp = `${p}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(skills, null, 2), "utf-8");
  await fs.rename(tmp, p);
}

// ── Write mutex ─────────────────────────────────────────────────────────
// Serialize all mutating operations to avoid lost-update races when the
// read-modify-write cycle of two callers interleaves.
let writeQueue: Promise<void> = Promise.resolve();
function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(() => fn());
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

// ── Public API ──────────────────────────────────────────────────────────

export async function listSkills(): Promise<Skill[]> {
  return readRaw();
}

/** Synchronous snapshot — used by the pack manifest at registry scan time. */
export function listSkillsSync(): Skill[] {
  const p = getSkillsPath();
  try {
    const buf = readFileSync(p, "utf-8");
    const parsed = JSON.parse(buf);
    if (!Array.isArray(parsed)) return [];
    const out: Skill[] = [];
    for (const row of parsed) {
      const res = skillSchema.safeParse(row);
      if (res.success) out.push(res.data);
    }
    return out;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    return [];
  }
}

export async function getSkill(id: string): Promise<Skill | null> {
  const all = await readRaw();
  return all.find((s) => s.id === id) ?? null;
}

export function createSkill(input: SkillCreateInput): Promise<Skill> {
  return enqueueWrite(async () => {
    const parsed = skillCreateInputSchema.parse(input);
    const all = await readRaw();
    const existingIds = new Set(all.map((s) => s.id));
    const id = await uniqueId(slugify(parsed.name), existingIds);
    const now = new Date().toISOString();
    const skill: Skill = {
      id,
      name: parsed.name,
      description: parsed.description ?? "",
      content: parsed.content ?? "",
      arguments: parsed.arguments ?? [],
      source: parsed.source,
      createdAt: now,
      updatedAt: now,
    };
    all.push(skill);
    await writeRaw(all);
    return skill;
  });
}

export function updateSkill(id: string, patch: SkillUpdateInput): Promise<Skill | null> {
  return enqueueWrite(async () => {
    const parsed = skillUpdateInputSchema.parse(patch);
    const all = await readRaw();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const prev = all[idx];
    const next: Skill = {
      ...prev,
      ...parsed,
      id: prev.id,
      createdAt: prev.createdAt,
      updatedAt: new Date().toISOString(),
      // preserve or update source carefully
      source: parsed.source ?? prev.source,
      arguments: parsed.arguments ?? prev.arguments,
    };
    all[idx] = next;
    await writeRaw(all);
    return next;
  });
}

export function deleteSkill(id: string): Promise<boolean> {
  return enqueueWrite(async () => {
    const all = await readRaw();
    const next = all.filter((s) => s.id !== id);
    if (next.length === all.length) return false;
    await writeRaw(next);
    return true;
  });
}

/** Replace a skill wholesale (used by refresh-cache write path). */
export function replaceSkill(skill: Skill): Promise<void> {
  return enqueueWrite(async () => {
    const all = await readRaw();
    const idx = all.findIndex((s) => s.id === skill.id);
    if (idx === -1) return;
    all[idx] = skill;
    await writeRaw(all);
  });
}
