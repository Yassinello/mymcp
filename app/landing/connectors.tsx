const CONNECTORS: { name: string; tools: number; blurb: string }[] = [
  { name: "Google Workspace", tools: 18, blurb: "Gmail, Calendar, Drive, Docs" },
  { name: "Obsidian Vault", tools: 14, blurb: "Read / write your markdown notes" },
  { name: "Slack", tools: 6, blurb: "Messages, channels, threads" },
  { name: "Notion", tools: 5, blurb: "Pages, databases, comments" },
  { name: "GitHub Issues", tools: 6, blurb: "Open, comment, close, search" },
  { name: "Linear", tools: 6, blurb: "Issues and cycles" },
  { name: "Airtable", tools: 7, blurb: "Records, formulas, views" },
  { name: "Apify / LinkedIn", tools: 8, blurb: "Actors + people & company lookups" },
  { name: "Browser Automation", tools: 4, blurb: "Stagehand-powered scraping" },
  { name: "Paywall Readers", tools: 2, blurb: "Bypass metered walls" },
  { name: "Composio", tools: 2, blurb: "200+ apps via a bridge tool" },
  { name: "Webhooks", tools: 3, blurb: "Inbound triggers for AI flows" },
  { name: "Skills", tools: 0, blurb: "User-defined tools, zero code" },
  { name: "Admin", tools: 5, blurb: "Health, logs, rate limits" },
];

export default function Connectors() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-mono text-blue-400 mb-3 tracking-widest uppercase">
            What you can plug in
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            14 connectors. 86 tools. All pre-wired.
          </h2>
          <p className="text-slate-400 text-base mt-3 max-w-2xl mx-auto leading-relaxed">
            Drop in an API key, the connector lights up. Skip the ones you don&apos;t use — nothing
            loads unless its env vars are present.
          </p>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CONNECTORS.map((c) => (
            <li
              key={c.name}
              className="flex items-start justify-between gap-3 bg-slate-900/40 border border-slate-800 hover:border-slate-700 rounded-lg px-4 py-3 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">{c.name}</p>
                <p className="text-slate-500 text-xs leading-relaxed mt-0.5">{c.blurb}</p>
              </div>
              <span className="shrink-0 text-[10px] font-mono font-semibold text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded px-1.5 py-0.5 tabular-nums">
                {c.tools > 0 ? `${c.tools} tools` : "dynamic"}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-center text-xs text-slate-500 mt-8">
          Missing one?{" "}
          <a
            href="https://github.com/Yassinello/kebab-mcp#adding-a-connector"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
          >
            Adding a connector
          </a>{" "}
          is ~40 lines of TypeScript.
        </p>
      </div>
    </section>
  );
}
