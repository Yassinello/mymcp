import { googlePack } from "@/packs/google/manifest";
import { vaultPack } from "@/packs/vault/manifest";
import { browserPack } from "@/packs/browser/manifest";
import { slackPack } from "@/packs/slack/manifest";
import { notionPack } from "@/packs/notion/manifest";
import { adminPack } from "@/packs/admin/manifest";
import type { PackManifest } from "@/core/types";
import { AppShell } from "../sidebar";

const ALL_PACKS: PackManifest[] = [
  googlePack,
  vaultPack,
  browserPack,
  slackPack,
  notionPack,
  adminPack,
];

export default function PacksPage() {
  const totalTools = ALL_PACKS.reduce((s, p) => s + p.tools.length, 0);

  return (
    <AppShell title="Packs" subtitle={`${ALL_PACKS.length} packs, ${totalTools} tools available.`}>
      <div className="space-y-6">
        {ALL_PACKS.map((pack) => (
          <div key={pack.id} className="border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold">{pack.label}</span>
              <span className="text-[11px] font-medium text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                {pack.tools.length} tools
              </span>
            </div>
            <p className="text-sm text-text-dim mb-4">{pack.description}</p>

            {pack.requiredEnvVars.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-[0.1em] mb-1.5">
                  Required
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {pack.requiredEnvVars.map((v) => (
                    <code
                      key={v}
                      className="text-xs bg-bg-muted px-2 py-0.5 rounded text-orange font-mono"
                    >
                      {v}
                    </code>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-border pt-3">
              {pack.tools.map((tool) => (
                <div key={tool.name} className="flex gap-3 py-1.5 text-sm">
                  <code className="text-accent font-mono text-xs font-semibold w-40 shrink-0 pt-0.5">
                    {tool.name}
                  </code>
                  <span className="text-text-dim text-xs leading-relaxed">
                    {tool.deprecated && (
                      <span className="text-orange font-medium">[Deprecated] </span>
                    )}
                    {tool.description.slice(0, 120)}
                    {tool.description.length > 120 ? "..." : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
