/**
 * Tiny markdown renderer for in-repo documentation pages.
 *
 * No external dependency: ships a regex-based subset that's enough for our
 * docs (h1-h3, paragraphs, lists, fenced code, inline code, bold, italic,
 * links). HTML is escaped before any markdown transformation runs, so the
 * output is safe to inject via dangerouslySetInnerHTML.
 *
 * If we ever need full CommonMark we can swap in marked / micromark — the
 * surface is one function call.
 */

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(text: string): string {
  // Inline code first so it isn't transformed further.
  let out = text.replace(/`([^`]+)`/g, (_m, code) => {
    return `<code class="font-mono text-accent bg-bg-muted px-1 py-0.5 rounded text-[0.85em]">${escapeHtml(code)}</code>`;
  });

  // Links: [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const safeUrl = /^(https?:|mailto:|#|\/)/.test(url) ? url : "#";
    return `<a href="${escapeHtml(safeUrl)}" class="text-accent hover:underline" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
  });

  // Bold **text** — run before italic so the non-greedy italic regex
  // doesn't eat `**` boundaries.
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic *text* — lookbehind avoids consuming the char before `*`
  // (the old `(^|[^*])` approach ate the leading char and broke
  // consecutive italic runs like `*a* *b*` → only the first rendered).
  out = out.replace(/(?<![*\w])\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");

  return out;
}

export function renderMarkdown(src: string): string {
  // Escape everything first; we'll re-introduce HTML via the transformer.
  const escaped = escapeHtml(src);
  const lines = escaped.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      out.push(
        `<pre class="bg-bg-muted border border-border rounded-md p-3 overflow-x-auto text-[12px] font-mono text-text-dim"><code data-lang="${escapeHtml(
          lang
        )}">${buf.join("\n")}</code></pre>`
      );
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length + 1; // h1 in source → h2 in output (the article title is h2)
      out.push(
        `<h${level} class="font-semibold text-text mt-5 mb-2 ${
          level === 2 ? "text-lg" : level === 3 ? "text-base" : "text-sm uppercase tracking-wide"
        }">${renderInline(h[2])}</h${level}>`
      );
      i++;
      continue;
    }

    // Unordered list
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*-\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul class="list-disc pl-5 space-y-1">${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ol class="list-decimal pl-5 space-y-1">${items.join("")}</ol>`);
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,3}\s|```|\s*-\s|\s*\d+\.\s)/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      out.push(`<p>${renderInline(paraLines.join(" "))}</p>`);
    }
  }

  return out.join("\n");
}
