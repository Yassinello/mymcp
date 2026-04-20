const CLIENTS = ["Claude Desktop", "Cursor", "Windsurf", "VS Code"];

export default function Compatibility() {
  return (
    <section className="py-16 px-6 border-t border-slate-800">
      <div className="max-w-4xl mx-auto text-center">
        <p className="text-sm text-slate-500 uppercase tracking-widest mb-8 font-mono">
          Works with
        </p>
        <div className="flex flex-wrap justify-center gap-6 sm:gap-10 mb-12">
          {CLIENTS.map((client) => (
            <span
              key={client}
              className="text-slate-300 font-medium text-sm sm:text-base hover:text-white transition-colors"
            >
              {client}
            </span>
          ))}
        </div>
        <div className="flex justify-center gap-8 text-sm text-slate-500 font-mono">
          <span>86 tools · 14 connectors</span>
          <span>·</span>
          <span>MIT License</span>
          <span>·</span>
          <span>Zero ongoing cost</span>
        </div>
      </div>
    </section>
  );
}
