const tools = [
  {
    name: "vault_write",
    description:
      "Créer ou mettre à jour une note dans le vault Obsidian. Gère automatiquement l'encodage base64, la résolution SHA pour les updates, et le frontmatter YAML optionnel.",
    params: [
      { name: "path", type: "string", required: true, desc: 'Chemin dans le vault, ex: "Veille/mon-article.md"' },
      { name: "content", type: "string", required: true, desc: "Contenu markdown de la note" },
      { name: "message", type: "string", required: false, desc: 'Commit message (défaut: "Update via YassMCP")' },
      { name: "frontmatter", type: "object", required: false, desc: "Objet YAML à injecter en frontmatter" },
    ],
    example: `vault_write({
  path: "Veille/ai-agents-2026.md",
  content: "# AI Agents en 2026\\n\\nLes agents autonomes...",
  frontmatter: {
    tags: ["ai", "agents", "veille"],
    source: "https://example.com/article",
    date: "2026-03-31"
  }
})`,
    category: "vault",
  },
  {
    name: "vault_read",
    description:
      "Lire une note du vault. Retourne le body markdown et le frontmatter parsé séparément.",
    params: [
      { name: "path", type: "string", required: true, desc: 'Chemin de la note, ex: "Projects/cadens.md"' },
    ],
    example: `vault_read({ path: "Projects/cadens.md" })

// Retourne:
{
  "path": "Projects/cadens.md",
  "name": "cadens.md",
  "frontmatter": { "status": "MVP", "stack": "TS, Vercel" },
  "body": "# Cadens\\n\\nPlateforme de..."
}`,
    category: "vault",
  },
  {
    name: "vault_search",
    description:
      "Recherche full-text dans le vault via GitHub Search API. Retourne les notes matchantes avec extraits de texte.",
    params: [
      { name: "query", type: "string", required: true, desc: "Termes de recherche" },
      { name: "folder", type: "string", required: false, desc: 'Filtrer par dossier, ex: "Veille/"' },
      { name: "limit", type: "number", required: false, desc: "Nombre max de résultats (défaut: 10)" },
    ],
    example: `vault_search({
  query: "product-market fit",
  folder: "Veille/",
  limit: 5
})`,
    category: "vault",
  },
  {
    name: "vault_list",
    description:
      "Lister les notes et dossiers d'un répertoire du vault. Utile pour naviguer la structure.",
    params: [
      { name: "folder", type: "string", required: false, desc: 'Dossier à lister (défaut: racine du vault)' },
    ],
    example: `vault_list({ folder: "Veille/" })

// Retourne:
{
  "folder": "Veille/",
  "count": 12,
  "entries": [
    { "name": "ai-agents.md", "type": "file", "size": 2340 },
    { "name": "SaaS/", "type": "dir" }
  ]
}`,
    category: "vault",
  },
  {
    name: "my_context",
    description:
      "Retourne le contexte personnel de Yassine (rôle, projets actifs, priorités, stack). Lit depuis System/context.md dans le vault.",
    params: [],
    example: `my_context()

// Retourne le contenu de System/context.md`,
    category: "context",
  },
  {
    name: "vault_delete",
    description:
      "Supprimer une note du vault Obsidian. Récupère automatiquement le SHA nécessaire avant suppression.",
    params: [
      { name: "path", type: "string", required: true, desc: 'Chemin de la note à supprimer, ex: "Veille/old-article.md"' },
      { name: "message", type: "string", required: false, desc: "Commit message pour la suppression" },
    ],
    example: `vault_delete({ path: "Inbox/draft-obsolete.md" })`,
    category: "vault",
  },
  {
    name: "vault_move",
    description:
      "Déplacer ou renommer une note. Lit la source, écrit à la nouvelle destination, puis supprime l'originale.",
    params: [
      { name: "from", type: "string", required: true, desc: 'Chemin actuel, ex: "Inbox/note.md"' },
      { name: "to", type: "string", required: true, desc: 'Nouveau chemin, ex: "Veille/note.md"' },
      { name: "message", type: "string", required: false, desc: "Commit message" },
    ],
    example: `vault_move({
  from: "Inbox/article-ai.md",
  to: "Veille/AI/article-ai.md"
})`,
    category: "vault",
  },
  {
    name: "save_article",
    description:
      "Sauvegarder un article web dans le vault. Fetch l'URL via Jina Reader (extraction markdown), ajoute le frontmatter (titre, source, date, tags), et écrit dans Veille/.",
    params: [
      { name: "url", type: "string", required: true, desc: "URL de l'article" },
      { name: "title", type: "string", required: false, desc: "Titre (auto-extrait si omis)" },
      { name: "tags", type: "string[]", required: false, desc: "Tags, ex: ['ai', 'strategy']" },
      { name: "folder", type: "string", required: false, desc: 'Dossier cible (défaut: "Veille/")' },
    ],
    example: `save_article({
  url: "https://example.com/great-article",
  tags: ["ai", "product"]
})`,
    category: "workflow",
  },
];

const useCases = [
  {
    title: "Sauvegarder un article de veille",
    steps: [
      "save_article avec l'URL",
      "Article auto-extrait en markdown + frontmatter",
      "Claude peut ensuite analyser/résumer via vault_read",
    ],
    tools: ["save_article", "vault_read"],
  },
  {
    title: "Retrouver une note existante",
    steps: [
      "vault_search avec les mots-clés",
      "vault_read sur le résultat pertinent",
    ],
    tools: ["vault_search", "vault_read"],
  },
  {
    title: "Explorer la structure du vault",
    steps: [
      "vault_list à la racine",
      "vault_list dans le dossier souhaité",
      "vault_read sur la note ciblée",
    ],
    tools: ["vault_list", "vault_read"],
  },
  {
    title: "Charger le contexte en début de session",
    steps: [
      "my_context pour récupérer rôle, projets, priorités",
      "Adapter les réponses au contexte actuel",
    ],
    tools: ["my_context"],
  },
  {
    title: "Créer un nouveau projet dans le vault",
    steps: [
      "vault_write dans Projects/ avec template structuré",
      "Ajouter frontmatter (status, stack, date)",
    ],
    tools: ["vault_write"],
  },
  {
    title: "Mettre à jour le contexte personnel",
    steps: [
      "vault_read sur System/context.md",
      "Modifier le contenu",
      "vault_write pour sauvegarder",
    ],
    tools: ["vault_read", "vault_write"],
  },
  {
    title: "Réorganiser le vault",
    steps: [
      "vault_list pour voir la structure",
      "vault_move pour déplacer les notes",
      "vault_delete pour supprimer les obsolètes",
    ],
    tools: ["vault_list", "vault_move", "vault_delete"],
  },
  {
    title: "Health check",
    steps: [
      "GET /api/health pour vérifier PAT + vault",
      "Voir le rate limit GitHub restant",
    ],
    tools: [],
  },
];

export default function AdminPage() {
  return (
    <div style={styles.body}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <h1 style={styles.title}>
            <span style={styles.logo}>&#9881;</span> YassMCP
          </h1>
          <p style={styles.subtitle}>Personal MCP Server — Admin Dashboard</p>
        </div>
        <div style={styles.badges}>
          <span style={{ ...styles.badge, ...styles.badgeGreen }}>v2.0.0</span>
          <span style={{ ...styles.badge, ...styles.badgeBlue }}>8 tools</span>
          <span style={{ ...styles.badge, ...styles.badgePurple }}>
            Streamable HTTP
          </span>
        </div>
      </header>

      {/* Connection */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Connexion MCP</h2>
        <div style={styles.codeBlock}>
          <pre style={styles.pre}>{`{
  "name": "YassMCP",
  "type": "url",
  "url": "https://yass-mcp.vercel.app/api/mcp",
  "headers": {
    "Authorization": "Bearer <MCP_AUTH_TOKEN>"
  }
}`}</pre>
        </div>
      </section>

      {/* Use Cases */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Use Cases</h2>
        <div style={styles.useCaseGrid}>
          {useCases.map((uc, i) => (
            <div key={i} style={styles.useCaseCard}>
              <h3 style={styles.useCaseTitle}>{uc.title}</h3>
              <ol style={styles.steps}>
                {uc.steps.map((step, j) => (
                  <li key={j} style={styles.step}>
                    {step}
                  </li>
                ))}
              </ol>
              <div style={styles.toolTags}>
                {uc.tools.map((t) => (
                  <span key={t} style={styles.toolTag}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tools Documentation */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Documentation des Tools</h2>
        {tools.map((tool) => (
          <div key={tool.name} style={styles.toolCard}>
            <div style={styles.toolHeader}>
              <code style={styles.toolName}>{tool.name}</code>
              <span
                style={{
                  ...styles.badge,
                  ...(tool.category === "vault"
                    ? styles.badgeBlue
                    : tool.category === "workflow"
                    ? styles.badgePurple
                    : styles.badgeYellow),
                }}
              >
                {tool.category}
              </span>
            </div>
            <p style={styles.toolDesc}>{tool.description}</p>

            {tool.params.length > 0 && (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Param</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Requis</th>
                    <th style={styles.th}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {tool.params.map((p) => (
                    <tr key={p.name}>
                      <td style={styles.td}>
                        <code style={styles.paramCode}>{p.name}</code>
                      </td>
                      <td style={styles.td}>
                        <code style={styles.typeCode}>{p.type}</code>
                      </td>
                      <td style={styles.td}>{p.required ? "oui" : "—"}</td>
                      <td style={styles.td}>{p.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <details style={styles.details}>
              <summary style={styles.summary}>Exemple</summary>
              <pre style={styles.examplePre}>
                <code>{tool.example}</code>
              </pre>
            </details>
          </div>
        ))}
      </section>

      {/* Architecture */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Architecture</h2>
        <div style={styles.archDiagram}>
          <div style={styles.archRow}>
            <span style={styles.archBox}>Claude Chat</span>
            <span style={styles.archBox}>Claude Code</span>
            <span style={styles.archBox}>Claude Artifacts</span>
          </div>
          <div style={styles.archArrow}>&#8595; MCP Streamable HTTP &#8595;</div>
          <div style={styles.archRow}>
            <span style={{ ...styles.archBox, ...styles.archBoxPrimary }}>
              YassMCP (Vercel)
            </span>
          </div>
          <div style={styles.archArrow}>&#8595; &#8595; &#8595;</div>
          <div style={styles.archRow}>
            <span style={styles.archBox}>
              GitHub API
              <br />
              <small>Obsidian vault</small>
            </span>
            <span style={{ ...styles.archBox, ...styles.archBoxSecret }}>
              Env Vars
              <br />
              <small>PAT, tokens</small>
            </span>
          </div>
        </div>
      </section>

      <footer style={styles.footer}>
        YassMCP v2.0.0 — Built by Yassine &times; Claude
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    lineHeight: 1.6,
    color: "#37352f",
    maxWidth: 960,
    margin: "0 auto",
    padding: "2rem",
    background: "#fafaf9",
    minHeight: "100vh",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottom: "2px solid #e8e8e8",
    paddingBottom: "1.5rem",
    marginBottom: "2rem",
  },
  headerInner: {},
  title: { fontSize: "2em", fontWeight: 700, margin: 0 },
  logo: { marginRight: 8 },
  subtitle: { color: "#9b9a97", fontSize: "0.95em", margin: "0.25rem 0 0" },
  badges: { display: "flex", gap: 8 },
  badge: {
    padding: "2px 10px",
    borderRadius: 4,
    fontSize: "0.82em",
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  badgeGreen: { background: "#e6f4ea", color: "#0f7b6c" },
  badgeBlue: { background: "#e8f0fe", color: "#2f80ed" },
  badgePurple: { background: "#f0e6f6", color: "#6940a5" },
  badgeYellow: { background: "#fef7e0", color: "#d9730d" },

  section: { marginBottom: "2.5rem" },
  sectionTitle: {
    fontSize: "1.4em",
    fontWeight: 600,
    borderBottom: "1px solid #e8e8e8",
    paddingBottom: "0.4rem",
    marginBottom: "1rem",
  },

  codeBlock: {
    background: "#1e1e1e",
    borderRadius: 8,
    padding: "1.25rem",
    overflow: "auto",
  },
  pre: {
    margin: 0,
    color: "#d4d4d4",
    fontSize: "0.88em",
    lineHeight: 1.6,
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  },

  // Use cases
  useCaseGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "1rem",
  },
  useCaseCard: {
    background: "white",
    border: "1px solid #e8e8e8",
    borderRadius: 8,
    padding: "1.25rem",
  },
  useCaseTitle: { fontSize: "1em", fontWeight: 600, margin: "0 0 0.75rem" },
  steps: { margin: "0 0 0.75rem", paddingLeft: "1.25rem", fontSize: "0.9em", color: "#555" },
  step: { marginBottom: 4 },
  toolTags: { display: "flex", gap: 6, flexWrap: "wrap" as const },
  toolTag: {
    background: "#e8f0fe",
    color: "#2f80ed",
    padding: "1px 8px",
    borderRadius: 3,
    fontSize: "0.78em",
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontWeight: 500,
  },

  // Tool cards
  toolCard: {
    background: "white",
    border: "1px solid #e8e8e8",
    borderLeft: "4px solid #2f80ed",
    borderRadius: 8,
    padding: "1.25rem",
    marginBottom: "1rem",
  },
  toolHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  toolName: {
    fontSize: "1.1em",
    fontWeight: 700,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    color: "#2f80ed",
  },
  toolDesc: { color: "#555", margin: "0 0 1rem", fontSize: "0.93em" },

  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: "0.9em",
    marginBottom: "0.75rem",
  },
  th: {
    background: "#f7f6f3",
    textAlign: "left" as const,
    padding: "0.5rem 0.75rem",
    fontWeight: 600,
    borderBottom: "2px solid #e8e8e8",
  },
  td: {
    padding: "0.5rem 0.75rem",
    borderBottom: "1px solid #f0f0f0",
    verticalAlign: "top" as const,
  },
  paramCode: {
    background: "#f7f6f3",
    padding: "1px 5px",
    borderRadius: 3,
    fontSize: "0.9em",
    color: "#eb5757",
  },
  typeCode: {
    color: "#6940a5",
    fontSize: "0.9em",
  },

  details: { marginTop: 8 },
  summary: {
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "0.9em",
    color: "#9b9a97",
    padding: "4px 0",
  },
  examplePre: {
    background: "#1e1e1e",
    color: "#d4d4d4",
    padding: "1rem",
    borderRadius: 6,
    fontSize: "0.84em",
    lineHeight: 1.5,
    overflow: "auto",
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    marginTop: 8,
  },

  // Architecture
  archDiagram: {
    background: "white",
    border: "1px solid #e8e8e8",
    borderRadius: 8,
    padding: "2rem",
    textAlign: "center" as const,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: "0.85em",
  },
  archRow: {
    display: "flex",
    justifyContent: "center",
    gap: 16,
    margin: "0.5rem 0",
    flexWrap: "wrap" as const,
  },
  archBox: {
    display: "inline-block",
    background: "#f7f6f3",
    border: "1px solid #d8d8d8",
    borderRadius: 6,
    padding: "8px 20px",
  },
  archBoxPrimary: {
    background: "#e8f0fe",
    borderColor: "#2f80ed",
    color: "#2f80ed",
    fontWeight: 600,
  },
  archBoxSecret: {
    background: "#fef7e0",
    borderColor: "#d9730d",
  },
  archArrow: { color: "#9b9a97", margin: "0.5rem 0", fontSize: "0.9em" },

  footer: {
    textAlign: "center" as const,
    color: "#9b9a97",
    fontSize: "0.85em",
    paddingTop: "2rem",
    borderTop: "1px solid #e8e8e8",
  },
};
