const tools = [
  {
    name: "vault_write",
    description:
      "Créer ou mettre à jour une note. Gère base64, résolution SHA, frontmatter YAML (js-yaml). Passer le SHA d'un vault_read pour skip l'appel GET.",
    params: [
      { name: "path", type: "string", required: true, desc: 'Chemin, ex: "Veille/article.md"' },
      { name: "content", type: "string", required: true, desc: "Contenu markdown" },
      { name: "message", type: "string", required: false, desc: "Commit message" },
      { name: "frontmatter", type: "object", required: false, desc: "Objet YAML frontmatter" },
      { name: "sha", type: "string", required: false, desc: "SHA connu (skip le GET)" },
    ],
    example: `vault_write({
  path: "Veille/ai-agents-2026.md",
  content: "# AI Agents\\n\\nContent...",
  frontmatter: {
    tags: ["ai", "agents"],
    source: "https://example.com",
    date: "2026-04-01"
  }
})`,
    category: "vault",
  },
  {
    name: "vault_read",
    description:
      "Lire une note. Retourne body markdown, frontmatter parsé (js-yaml), et le SHA réutilisable pour vault_write.",
    params: [
      { name: "path", type: "string", required: true, desc: 'ex: "Projects/cadens.md"' },
    ],
    example: `vault_read({ path: "Projects/cadens.md" })
// → { path, name, size, sha, frontmatter: {...}, body: "# ..." }`,
    category: "vault",
  },
  {
    name: "vault_search",
    description:
      "Recherche full-text via GitHub Search API. Supporte la pagination.",
    params: [
      { name: "query", type: "string", required: true, desc: "Termes de recherche" },
      { name: "folder", type: "string", required: false, desc: 'Filtrer par dossier' },
      { name: "limit", type: "number", required: false, desc: "Résultats par page (défaut: 10, max: 100)" },
      { name: "page", type: "number", required: false, desc: "Page (défaut: 1)" },
    ],
    example: `vault_search({ query: "product-market fit", folder: "Veille/", limit: 5 })
// → { totalCount: 23, page: 1, count: 5, results: [...] }`,
    category: "vault",
  },
  {
    name: "vault_list",
    description:
      "Lister les notes et dossiers d'un répertoire du vault.",
    params: [
      { name: "folder", type: "string", required: false, desc: 'Dossier (défaut: racine)' },
    ],
    example: `vault_list({ folder: "Veille/" })`,
    category: "vault",
  },
  {
    name: "vault_delete",
    description:
      "Supprimer une note. Récupère le SHA automatiquement.",
    params: [
      { name: "path", type: "string", required: true, desc: "Chemin de la note" },
      { name: "message", type: "string", required: false, desc: "Commit message" },
    ],
    example: `vault_delete({ path: "Inbox/draft-obsolete.md" })`,
    category: "vault",
  },
  {
    name: "vault_move",
    description:
      "Déplacer/renommer une note. Read → Write → Delete avec gestion d'erreurs partielles. Optimisé (SHA réutilisé).",
    params: [
      { name: "from", type: "string", required: true, desc: "Chemin actuel" },
      { name: "to", type: "string", required: true, desc: "Nouveau chemin" },
      { name: "message", type: "string", required: false, desc: "Commit message" },
    ],
    example: `vault_move({ from: "Inbox/note.md", to: "Veille/AI/note.md" })`,
    category: "vault",
  },
  {
    name: "save_article",
    description:
      "Sauvegarder un article web. Fetch via Jina Reader → markdown → frontmatter YAML auto → vault. Max 5MB, timeout 15s.",
    params: [
      { name: "url", type: "string", required: true, desc: "URL de l'article" },
      { name: "title", type: "string", required: false, desc: "Titre (auto-extrait si omis)" },
      { name: "tags", type: "string[]", required: false, desc: "Tags" },
      { name: "folder", type: "string", required: false, desc: 'Dossier (défaut: "Veille/")' },
    ],
    example: `save_article({
  url: "https://paulgraham.com/writes.html",
  tags: ["writing", "essays"]
})`,
    category: "workflow",
  },
  {
    name: "my_context",
    description:
      "Contexte personnel depuis System/context.md — rôle, projets, priorités, stack.",
    params: [],
    example: `my_context()
// → Retourne le markdown de System/context.md`,
    category: "context",
  },
];

const useCases = [
  {
    title: "Sauvegarder un article de veille",
    steps: [
      "save_article avec l'URL",
      "Article auto-extrait + frontmatter",
      "vault_read pour analyser/résumer",
    ],
    tools: ["save_article"],
  },
  {
    title: "Retrouver une note",
    steps: [
      "vault_search avec mots-clés",
      "vault_read sur le résultat",
    ],
    tools: ["vault_search", "vault_read"],
  },
  {
    title: "Explorer le vault",
    steps: [
      "vault_list à la racine",
      "vault_list dans un dossier",
      "vault_read sur la note",
    ],
    tools: ["vault_list", "vault_read"],
  },
  {
    title: "Charger le contexte",
    steps: [
      "my_context en début de session",
      "Adapter les réponses au contexte",
    ],
    tools: ["my_context"],
  },
  {
    title: "Créer un projet",
    steps: [
      "vault_write dans Projects/",
      "Frontmatter avec status et stack",
    ],
    tools: ["vault_write"],
  },
  {
    title: "Réorganiser le vault",
    steps: [
      "vault_list pour la structure",
      "vault_move pour déplacer",
      "vault_delete pour nettoyer",
    ],
    tools: ["vault_move", "vault_delete"],
  },
  {
    title: "Mettre à jour une note",
    steps: [
      "vault_read pour récupérer SHA",
      "vault_write avec SHA (skip GET)",
    ],
    tools: ["vault_read", "vault_write"],
  },
  {
    title: "Health check",
    steps: [
      "GET /api/health",
      "Vérifie PAT + vault + rate limit",
    ],
    tools: [],
  },
];

const changelog = [
  { version: "v3.1", desc: "Guide de connexion multi-client (Claude Desktop via mcp-remote, Claude Code natif, curl). Refonte section connexion." },
  { version: "v3.0", desc: "Audit complet. js-yaml, path validation, timing-safe auth, fetch timeouts, pagination, SHA passthrough, Jina size limit, optimised vault_move" },
  { version: "v2.0", desc: "vault_delete, vault_move, save_article, structured logging, dashboard auth, rate limiting, health check" },
  { version: "v1.0", desc: "vault_write, vault_read, vault_search, vault_list, my_context — initial release" },
];

export default function AdminPage() {
  const categoryColor = (cat: string) =>
    cat === "vault" ? "badge-blue" : cat === "workflow" ? "badge-purple" : "badge-yellow";

  return (
    <div className="container">
      {/* Header */}
      <header className="header">
        <div>
          <h1 className="header-title">YassMCP</h1>
          <p className="header-subtitle">Personal MCP Server — Admin Dashboard</p>
        </div>
        <div className="header-badges">
          <span className="badge badge-green">
            <span className="status-dot live" />
            Live
          </span>
          <span className="badge badge-blue">8 tools</span>
          <span className="badge badge-purple">v3.1</span>
          <span className="badge badge-dim">Streamable HTTP</span>
        </div>
      </header>

      {/* Stats */}
      <div className="stats-bar">
        <div className="stat-card">
          <span className="stat-value" style={{ color: "var(--accent)" }}>8</span>
          <span className="stat-label">Tools actifs</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: "var(--green)" }}>6</span>
          <span className="stat-label">Vault operations</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: "var(--purple)" }}>1</span>
          <span className="stat-label">Workflow</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: "var(--yellow)" }}>1</span>
          <span className="stat-label">Context</span>
        </div>
      </div>

      {/* Connection Guide */}
      <section className="section">
        <h2 className="section-title">Connexion</h2>

        {/* Claude Desktop */}
        <div className="connect-method">
          <div className="connect-header">
            <span className="connect-icon">&#9654;</span>
            <div>
              <h3 className="connect-title">Claude Desktop</h3>
              <p className="connect-subtitle">Via mcp-remote bridge — traduit HTTP distant en stdio local</p>
            </div>
            <span className="badge badge-green">Recommandé</span>
          </div>
          <div className="connect-steps">
            <div className="connect-step">
              <span className="step-number">1</span>
              <div>
                <p className="step-text">Ouvrir le fichier de configuration Claude Desktop :</p>
                <div className="connection-block">
                  <pre><span className="key">Windows</span>{` : %APPDATA%\\Claude\\claude_desktop_config.json`}{"\n"}<span className="key">macOS</span>{`   : ~/Library/Application Support/Claude/claude_desktop_config.json`}</pre>
                </div>
              </div>
            </div>
            <div className="connect-step">
              <span className="step-number">2</span>
              <div>
                <p className="step-text">Ajouter cette config dans le fichier :</p>
                <div className="connection-block">
                  <pre>{`{
  `}<span className="key">{`"mcpServers"`}</span>{`: {
    `}<span className="key">{`"YassMCP"`}</span>{`: {
      `}<span className="key">{`"command"`}</span>{`: `}<span className="string">{`"npx"`}</span>{`,
      `}<span className="key">{`"args"`}</span>{`: [`}<span className="string">{`"-y"`}</span>{`, `}<span className="string">{`"mcp-remote"`}</span>{`, `}<span className="string">{`"https://mcp-yass.vercel.app/api/mcp?token=<MCP_AUTH_TOKEN>"`}</span>{`]
    }
  }
}`}</pre>
                </div>
              </div>
            </div>
            <div className="connect-step">
              <span className="step-number">3</span>
              <p className="step-text">Redémarrer Claude Desktop. Les 8 tools apparaissent automatiquement.</p>
            </div>
          </div>
          <div className="connect-note">
            <strong>Note :</strong> <code>mcp-remote</code> est un bridge npm officiel qui convertit le transport Streamable HTTP en stdio. Nécessite Node.js installé. Se met à jour automatiquement via <code>npx -y</code>.
          </div>
        </div>

        {/* Claude Code */}
        <div className="connect-method">
          <div className="connect-header">
            <span className="connect-icon">&#9654;</span>
            <div>
              <h3 className="connect-title">Claude Code</h3>
              <p className="connect-subtitle">Connexion HTTP directe avec Bearer token — natif, pas de bridge</p>
            </div>
            <span className="badge badge-blue">Natif</span>
          </div>
          <div className="connect-steps">
            <div className="connect-step">
              <span className="step-number">1</span>
              <div>
                <p className="step-text">Ajouter dans les settings Claude Code (<code>~/.claude/settings.json</code> ou projet) :</p>
                <div className="connection-block">
                  <pre>{`{
  `}<span className="key">{`"mcpServers"`}</span>{`: {
    `}<span className="key">{`"YassMCP"`}</span>{`: {
      `}<span className="key">{`"type"`}</span>{`: `}<span className="string">{`"http"`}</span>{`,
      `}<span className="key">{`"url"`}</span>{`: `}<span className="string">{`"https://mcp-yass.vercel.app/api/mcp"`}</span>{`,
      `}<span className="key">{`"headers"`}</span>{`: {
        `}<span className="key">{`"Authorization"`}</span>{`: `}<span className="string">{`"Bearer <MCP_AUTH_TOKEN>"`}</span>{`
      }
    }
  }
}`}</pre>
                </div>
              </div>
            </div>
            <div className="connect-step">
              <span className="step-number">2</span>
              <p className="step-text">Relancer Claude Code. Les tools sont disponibles immédiatement.</p>
            </div>
          </div>
        </div>

        {/* Claude.ai */}
        <div className="connect-method">
          <div className="connect-header">
            <span className="connect-icon">&#9654;</span>
            <div>
              <h3 className="connect-title">Claude.ai (web)</h3>
              <p className="connect-subtitle">Nécessite OAuth 2.1 — pas encore supporté</p>
            </div>
            <span className="badge badge-dim">Bientôt</span>
          </div>
          <div className="connect-note">
            Claude.ai exige un flow OAuth 2.1 complet (discovery + PKCE + token exchange). Pas encore implémenté. En attendant, utiliser Claude Desktop ou Claude Code.
          </div>
        </div>

        {/* curl */}
        <div className="connect-method">
          <div className="connect-header">
            <span className="connect-icon">&#9654;</span>
            <div>
              <h3 className="connect-title">curl / API directe</h3>
              <p className="connect-subtitle">Pour tester ou intégrer dans un script</p>
            </div>
            <span className="badge badge-dim">Debug</span>
          </div>
          <div className="connection-block">
            <pre>{`curl -X POST https://mcp-yass.vercel.app/api/mcp \\
  -H `}<span className="string">{`"Authorization: Bearer <MCP_AUTH_TOKEN>"`}</span>{` \\
  -H `}<span className="string">{`"Content-Type: application/json"`}</span>{` \\
  -H `}<span className="string">{`"Accept: application/json, text/event-stream"`}</span>{` \\
  -d '`}<span className="key">{`{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}`}</span>{`'`}</pre>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="section">
        <h2 className="section-title">Use Cases</h2>
        <div className="usecase-grid">
          {useCases.map((uc, i) => (
            <div key={i} className="usecase-card">
              <h3 className="usecase-title">{uc.title}</h3>
              <ul className="usecase-steps">
                {uc.steps.map((step, j) => (
                  <li key={j}>{step}</li>
                ))}
              </ul>
              <div className="usecase-tags">
                {uc.tools.map((t) => (
                  <span key={t} className="tool-tag">{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tools */}
      <section className="section">
        <h2 className="section-title">Tools</h2>
        {tools.map((tool) => (
          <div key={tool.name} className="tool-card">
            <div className="tool-header">
              <span className="tool-name">{tool.name}</span>
              <span className={`badge ${categoryColor(tool.category)}`}>
                {tool.category}
              </span>
            </div>
            <p className="tool-desc">{tool.description}</p>

            {tool.params.length > 0 && (
              <table className="params-table">
                <thead>
                  <tr>
                    <th>Param</th>
                    <th>Type</th>
                    <th>Requis</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {tool.params.map((p) => (
                    <tr key={p.name}>
                      <td><span className="param-name">{p.name}</span></td>
                      <td><span className="param-type">{p.type}</span></td>
                      <td><span className="param-req">{p.required ? "oui" : "—"}</span></td>
                      <td style={{ color: "var(--text-dim)" }}>{p.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <details>
              <summary>
                <span className="example-toggle">▸ Exemple</span>
              </summary>
              <div className="example-code">{tool.example}</div>
            </details>
          </div>
        ))}
      </section>

      {/* Architecture */}
      <section className="section">
        <h2 className="section-title">Architecture</h2>
        <div className="arch-container">
          <div className="arch-row">
            <span className="arch-box">Claude Chat</span>
            <span className="arch-box">Claude Code</span>
            <span className="arch-box">Claude Artifacts</span>
          </div>
          <div className="arch-arrow">↓ MCP Streamable HTTP ↓</div>
          <div className="arch-row">
            <span className="arch-box primary">YassMCP (Vercel)</span>
          </div>
          <div className="arch-arrow">↓ ↓ ↓</div>
          <div className="arch-row">
            <span className="arch-box">
              GitHub API<br /><small style={{ color: "var(--text-muted)" }}>Obsidian vault</small>
            </span>
            <span className="arch-box">
              Jina Reader<br /><small style={{ color: "var(--text-muted)" }}>Article extraction</small>
            </span>
            <span className="arch-box secret">
              Env Vars<br /><small>PAT, tokens</small>
            </span>
          </div>
        </div>
      </section>

      {/* Changelog */}
      <section className="section">
        <h2 className="section-title">Changelog</h2>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem 1.5rem" }}>
          {changelog.map((entry) => (
            <div key={entry.version} className="changelog-item">
              <span className="changelog-version">{entry.version}</span>
              <span className="changelog-desc">{entry.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Endpoints */}
      <section className="section">
        <h2 className="section-title">Endpoints</h2>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem 1.5rem" }}>
          <table className="params-table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Auth</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="param-name">/api/mcp</span></td>
                <td><span className="badge badge-green">Bearer / ?token=</span></td>
                <td style={{ color: "var(--text-dim)" }}>MCP Streamable HTTP endpoint</td>
              </tr>
              <tr>
                <td><span className="param-name">/api/health</span></td>
                <td><span className="badge badge-green">Bearer / ?token=</span></td>
                <td style={{ color: "var(--text-dim)" }}>Health check (PAT, vault, rate limit GitHub)</td>
              </tr>
              <tr>
                <td><span className="param-name">/</span></td>
                <td><span className="badge badge-yellow">?token=</span></td>
                <td style={{ color: "var(--text-dim)" }}>Admin dashboard (cette page)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <footer className="footer">
        YassMCP v3.1.0 — Built by Yassine × Claude
      </footer>
    </div>
  );
}
