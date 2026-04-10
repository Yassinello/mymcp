"use client";

import { usePathname } from "next/navigation";

const NAV = [
  { section: "OVERVIEW", items: [{ href: "/", label: "Dashboard", icon: "grid" }] },
  {
    section: "TOOLS",
    items: [
      { href: "/packs", label: "Packs", icon: "package" },
      { href: "/playground", label: "Playground", icon: "terminal" },
    ],
  },
  {
    section: "CONFIGURATION",
    items: [{ href: "/setup", label: "Setup", icon: "settings" }],
  },
];

const ICONS: Record<string, string> = {
  grid: "M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5ZM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4Z",
  package:
    "m16.5 9.4-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12",
  terminal: "m4 17 6-6-6-6m8 14h8",
  settings:
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
};

function Icon({ name }: { name: string }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r border-border bg-bg-sidebar min-h-screen flex flex-col py-6 px-4 shrink-0">
      <div className="mb-8 px-2">
        <h1 className="text-lg font-bold tracking-tight">MyMCP</h1>
        <p className="text-xs text-text-muted mt-0.5">Personal MCP Server</p>
      </div>

      <nav className="flex-1 space-y-6">
        {NAV.map((section) => (
          <div key={section.section}>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-[0.1em] px-2 mb-2">
              {section.section}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                        active
                          ? "bg-accent/10 text-accent font-medium"
                          : "text-text-dim hover:bg-bg-muted hover:text-text"
                      }`}
                    >
                      <Icon name={item.icon} />
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-auto pt-4 border-t border-border px-2">
        <p className="text-[11px] text-text-muted">v0.1.1</p>
        <a
          href="https://github.com/Yassinello/mymcp"
          target="_blank"
          rel="noopener"
          className="text-[11px] text-accent hover:underline"
        >
          GitHub
        </a>
      </div>
    </aside>
  );
}

export function AppShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-8 py-10">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-text-dim mt-1">{subtitle}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
