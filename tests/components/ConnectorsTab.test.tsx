/**
 * @vitest-environment jsdom
 */
import "./setup";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConnectorsTab } from "../../app/config/tabs/connectors";
import type { ConnectorSummary } from "../../app/config/tabs";

// Mock the wizard module which ConnectorsTab imports for PACKS / CredentialInput
vi.mock("../../app/config/pack-defs", () => ({
  PACKS: [
    {
      id: "google",
      label: "Google Workspace",
      vars: [{ key: "GOOGLE_CLIENT_ID", label: "Client ID" }],
    },
    {
      id: "vault",
      label: "Obsidian Vault",
      vars: [{ key: "GITHUB_PAT", label: "GitHub PAT" }],
    },
  ],
  CredentialInput: ({
    v,
    value,
    onChange,
  }: {
    v: { key: string; label: string };
    value: string;
    onChange: (v: string) => void;
  }) => (
    <input data-testid={`cred-${v.key}`} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  normalizeGitHubRepo: (v: string) => v,
}));

// Mock renderMarkdown to avoid pulling in the real module
vi.mock("@/core/markdown-lite", () => ({
  renderMarkdown: (src: string) => `<p>${src}</p>`,
}));

const mockConnectors: ConnectorSummary[] = [
  {
    id: "google",
    label: "Google Workspace",
    description: "Gmail, Calendar, Drive, Contacts",
    enabled: true,
    reason: "",
    toolCount: 18,
    requiredEnvVars: ["GOOGLE_CLIENT_ID"],
    tools: [
      { name: "gmail_search", description: "Search emails", destructive: false },
      { name: "calendar_events", description: "List events", destructive: false },
    ],
  },
  {
    id: "vault",
    label: "Obsidian Vault",
    description: "Read/write vault notes",
    enabled: false,
    reason: "missing env vars: GITHUB_PAT",
    toolCount: 15,
    requiredEnvVars: ["GITHUB_PAT"],
    tools: [{ name: "vault_read", description: "Read a note", destructive: false }],
  },
];

describe("ConnectorsTab", () => {
  beforeEach(() => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, vars: { GOOGLE_CLIENT_ID: "xxx" } }),
    } as unknown as Response);
  });

  it("renders connector names and status badges", async () => {
    render(<ConnectorsTab connectors={mockConnectors} />);

    await waitFor(() => {
      expect(screen.getByText("Google Workspace")).toBeInTheDocument();
      expect(screen.getByText("Obsidian Vault")).toBeInTheDocument();
    });

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Setup needed")).toBeInTheDocument();
  });

  it("expands a connector on click to show tools", async () => {
    render(<ConnectorsTab connectors={mockConnectors} />);

    await waitFor(() => {
      expect(screen.getByText("Google Workspace")).toBeInTheDocument();
    });

    // Click the Google Workspace card to expand it — use getAllByText since
    // it may render twice (collapsed + expanded)
    fireEvent.click(screen.getAllByText("Google Workspace")[0]);

    // The tools list should now be visible (inside an expanded section)
    await waitFor(() => {
      expect(screen.getByText("gmail_search")).toBeInTheDocument();
      expect(screen.getByText("calendar_events")).toBeInTheDocument();
    });
  });

  it("shows tool count for each connector", async () => {
    render(<ConnectorsTab connectors={mockConnectors} />);

    await waitFor(() => {
      // Tool counts are split across text nodes ("18" + " tools"), use a matcher
      expect(screen.getAllByText(/18\s*tools/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/15\s*tools/).length).toBeGreaterThan(0);
    });
  });
});
