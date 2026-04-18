/**
 * @vitest-environment jsdom
 */
import "./setup";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DocumentationTab, type DocEntry } from "../../app/config/tabs/documentation";

// Mock renderMarkdown to avoid pulling in the real module
vi.mock("@/core/markdown-lite", () => ({
  renderMarkdown: (src: string) => `<p>${src}</p>`,
}));

const mockDocs: DocEntry[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    summary: "How to set up Kebab MCP",
    content: "Install and deploy in 5 minutes.",
  },
  {
    slug: "connectors",
    title: "Connectors Guide",
    summary: "Configure your connectors",
    content: "Each connector activates via env vars.",
  },
];

describe("DocumentationTab", () => {
  it("renders doc titles in the sidebar", () => {
    render(<DocumentationTab docs={mockDocs} />);

    // "Getting Started" appears both in sidebar and as h2 heading — use role
    const sidebarButtons = screen.getAllByRole("button");
    const buttonTexts = sidebarButtons.map((b) => b.textContent);
    expect(buttonTexts).toContain("Getting Started");
    expect(buttonTexts).toContain("Connectors Guide");
  });

  it("shows the first doc content by default", () => {
    render(<DocumentationTab docs={mockDocs} />);

    // Summary appears as <p> text
    expect(screen.getByText("How to set up Kebab MCP")).toBeInTheDocument();
  });

  it("switches doc content when clicking a sidebar item", () => {
    render(<DocumentationTab docs={mockDocs} />);

    // Click the sidebar button for the second doc
    fireEvent.click(screen.getByRole("button", { name: "Connectors Guide" }));

    expect(screen.getByText("Configure your connectors")).toBeInTheDocument();
  });

  it("shows empty state when no docs provided", () => {
    render(<DocumentationTab docs={[]} />);

    expect(screen.getByText("No documentation files found.")).toBeInTheDocument();
  });
});
