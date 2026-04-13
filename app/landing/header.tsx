import OpenInstanceButton from "./open-instance-button";

export default function LandingHeader() {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-white font-semibold tracking-tight">MyMCP</span>
        </div>
        <nav className="flex items-center gap-6">
          <a
            href="https://github.com/Yassinello/mymcp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            GitHub
          </a>
          <OpenInstanceButton />
        </nav>
      </div>
    </header>
  );
}
