import { z } from "zod";
import { __resetRegistryCacheForTests } from "@/core/registry";
import { emit } from "@/core/events";
import { clearKVReadCache } from "@/core/kv-store";
import { clearLogStoreBuffer } from "@/core/log-store";

export const cacheEvictSchema = {
  scope: z
    .enum(["registry", "kv", "logs", "all"])
    .optional()
    .default("all")
    .describe("Which cache to clear: registry, kv, logs, or all (default: all)"),
};

export async function handleCacheEvict(params: { scope?: "registry" | "kv" | "logs" | "all" }) {
  const scope = params.scope ?? "all";
  const cleared: string[] = [];

  if (scope === "registry" || scope === "all") {
    __resetRegistryCacheForTests();
    emit("env.changed");
    cleared.push("registry");
  }

  if (scope === "kv" || scope === "all") {
    clearKVReadCache();
    cleared.push("kv read cache");
  }

  if (scope === "logs" || scope === "all") {
    clearLogStoreBuffer();
    cleared.push("log store buffer");
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `Cache cleared: ${cleared.join(", ")}.`,
      },
    ],
  };
}
