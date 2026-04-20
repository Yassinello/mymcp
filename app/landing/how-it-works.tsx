const STEPS: {
  n: number;
  title: string;
  body: string;
  icon: React.ReactNode;
}[] = [
  {
    n: 1,
    title: "Deploy",
    body: "One click on the Deploy to Vercel button forks this repo, provisions Upstash Redis for durable storage, and boots the instance. No CLI, no env-var wrangling.",
    icon: (
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v12m0 0-4-4m4 4 4-4" />
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
    ),
  },
  {
    n: 2,
    title: "Configure",
    body: "The welcome flow detects your storage, mints an auth token, and hands you a save-and-confirm UX. Three screens, zero YAML.",
    icon: (
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </svg>
    ),
  },
  {
    n: 3,
    title: "Connect",
    body: "Paste the HTTP endpoint and your token into Claude Desktop, Cursor, Windsurf, or any MCP-compatible client. One URL, every tool on it.",
    icon: (
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 px-6 border-t border-slate-800">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-mono text-blue-400 mb-3 tracking-widest uppercase">
            How it works
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Three steps to personal MCP.
          </h2>
          <p className="text-slate-400 text-base mt-3 max-w-xl mx-auto leading-relaxed">
            No infra, no YAML, no serverless debugging. The happy path fits in one short session.
          </p>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="relative bg-slate-900/60 border border-slate-800 rounded-xl p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <span
                  aria-hidden
                  className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs font-bold"
                >
                  {step.n}
                </span>
                <span className="text-blue-300">{step.icon}</span>
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">{step.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
