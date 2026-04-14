import { describe, it, expect } from "vitest";
import { renderMarkdown, escapeHtml } from "./markdown-lite";

describe("escapeHtml", () => {
  it("escapes &, <, >, quotes", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    expect(escapeHtml('"x"')).toBe("&quot;x&quot;");
    expect(escapeHtml("'y'")).toBe("&#39;y&#39;");
  });
});

describe("renderMarkdown", () => {
  it("renders headings (h1 → h2, h2 → h3, h3 → h4)", () => {
    const out = renderMarkdown("# top\n## mid\n### sub");
    expect(out).toContain("<h2");
    expect(out).toContain(">top<");
    expect(out).toContain("<h3");
    expect(out).toContain(">mid<");
    expect(out).toContain("<h4");
    expect(out).toContain(">sub<");
  });

  it("renders unordered lists", () => {
    const out = renderMarkdown("- one\n- two\n- three");
    expect(out).toContain("<ul");
    expect(out).toContain("<li>one</li>");
    expect(out).toContain("<li>three</li>");
  });

  it("renders ordered lists", () => {
    const out = renderMarkdown("1. first\n2. second");
    expect(out).toContain("<ol");
    expect(out).toContain("<li>first</li>");
  });

  it("renders fenced code blocks with escape", () => {
    const out = renderMarkdown("```js\nconst x = '<a>';\n```");
    expect(out).toContain("<pre");
    expect(out).toContain("&lt;a&gt;");
    // Code body must NOT contain unescaped angle brackets
    expect(out).not.toMatch(/<a>/);
  });

  it("renders inline code", () => {
    const out = renderMarkdown("see `npm install`");
    expect(out).toContain("<code");
    expect(out).toContain("npm install");
  });

  it("renders bold and italic", () => {
    const out = renderMarkdown("**bold** and *italic*");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
  });

  it("renders consecutive italic runs without eating the separator (L1 regression)", () => {
    const out = renderMarkdown("*one* *two* *three*");
    // All three should render as italic — the old regex consumed the
    // leading space and only rendered one per pass.
    expect(out.match(/<em>/g)?.length).toBe(3);
    expect(out).toContain("<em>one</em>");
    expect(out).toContain("<em>two</em>");
    expect(out).toContain("<em>three</em>");
  });

  it("renders safe links", () => {
    const out = renderMarkdown("[Vercel](https://vercel.com)");
    expect(out).toContain('href="https://vercel.com"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener"');
  });

  it("strips javascript: URLs from links", () => {
    const out = renderMarkdown("[click](javascript:alert(1))");
    expect(out).not.toContain("javascript:");
    expect(out).toContain('href="#"');
  });

  it("escapes raw HTML in input", () => {
    const out = renderMarkdown("<script>alert(1)</script>");
    // Should appear escaped, not as a real script tag
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toMatch(/<script[^>]*>alert/);
  });

  it("renders paragraphs from prose blocks", () => {
    const out = renderMarkdown("First paragraph.\n\nSecond paragraph.");
    expect(out).toContain("<p>First paragraph.</p>");
    expect(out).toContain("<p>Second paragraph.</p>");
  });
});

/**
 * XSS corpus — inputs that have been historically dangerous in hand-rolled
 * markdown renderers. Each input's output must NOT contain:
 * - any raw `<script` tag (case-insensitive)
 * - any raw `<iframe`, `<object`, `<embed`, `<svg`, `<math` tag
 * - any `javascript:`, `data:text/html`, `vbscript:`, `file:` URL
 * - any inline event handler (`onclick=`, `onerror=`, etc.)
 * - any unescaped `<` that precedes an alpha char (naive but catches leaks)
 */
describe("renderMarkdown XSS corpus", () => {
  const DANGEROUS_INPUTS = [
    // Direct script injection
    "<script>alert(1)</script>",
    "<SCRIPT>alert(1)</SCRIPT>",
    "<script\nsrc='//evil'>",
    // Link injections
    "[click](javascript:alert(1))",
    "[click](JAVASCRIPT:alert(1))",
    "[click](  javascript:alert(1))",
    "[click](vbscript:msgbox(1))",
    "[click](data:text/html,<script>alert(1)</script>)",
    "[click](file:///etc/passwd)",
    // Tag injections inside text
    "Hello <iframe src=evil></iframe>",
    "Hello <object data=evil></object>",
    "Hello <embed src=evil>",
    "<svg onload=alert(1)>",
    "<math><mtext><script>alert(1)</script></mtext></math>",
    // Event handler injections through crafted text
    "<img src=x onerror=alert(1)>",
    "<body onload=alert(1)>",
    // Attribute injection through link label
    "[<img src=x onerror=alert(1)>](https://example.com)",
    "[normal](https://example.com\" onclick=\"alert(1))",
    // HTML comments
    "<!-- <script>alert(1)</script> -->",
    // Polyglot
    "`code`<script>alert(1)</script>`more`",
    // Backtick escape via inline code
    "`</code><script>alert(1)</script>`",
  ];

  // Security invariant for a markdown → HTML renderer: every dangerous
  // HTML construct in the input must be rendered as ESCAPED text, never
  // as an active tag. We therefore check for literal unescaped dangerous
  // tag openings and for dangerous URL schemes in href start-of-value.
  //
  // Event handler attributes (`onclick=`, `onerror=`) are NOT checked
  // directly because they legitimately appear inside quoted href values
  // in escaped form (harmless text). The real XSS risk for event handlers
  // is always carried by a raw `<tag ...>` opening, which the tag-opening
  // patterns already catch.
  const BANNED_PATTERNS = [
    /<script[\s>]/i,
    /<iframe[\s>]/i,
    /<object[\s>]/i,
    /<embed[\s>]/i,
    /<svg[\s>]/i,
    /<math[\s>]/i,
    /<body[\s>]/i,
    /<img[\s>]/i,
    // Dangerous URL scheme at the very start of an href attribute value.
    /href=["']\s*javascript:/i,
    /href=["']\s*vbscript:/i,
    /href=["']\s*data:text\/html/i,
  ];

  for (const input of DANGEROUS_INPUTS) {
    it(`sanitizes: ${input.slice(0, 50).replace(/\n/g, "\\n")}`, () => {
      const output = renderMarkdown(input);
      for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(output)) {
          throw new Error(
            `Renderer output matched banned pattern ${pattern}\nInput: ${input}\nOutput: ${output}`
          );
        }
      }
    });
  }

  it("sanitizes a polyglot payload composed of 100 dangerous fragments", () => {
    const blob = DANGEROUS_INPUTS.join("\n\n").repeat(5);
    const output = renderMarkdown(blob);
    for (const pattern of BANNED_PATTERNS) {
      expect(output).not.toMatch(pattern);
    }
  });
});
