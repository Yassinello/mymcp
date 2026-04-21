import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LandingPage from "./landing/landing-page";
import { getConfig } from "@/core/config-facade";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kebab MCP — Your Personal MCP Server",
  description:
    "One Vercel deploy. 65+ tools. Your data, your keys. Kebab MCP is the open source personal MCP server that gives your AI assistant access to calendar, email, GitHub, and more.",
  openGraph: {
    title: "Kebab MCP — Your Personal MCP Server",
    description: "Open source. MIT licensed. One deploy, 65+ tools, zero ongoing cost.",
  },
};

export default function HomePage() {
  // Any deploy with a configured MCP_AUTH_TOKEN is, by definition, a personal
  // instance — showing the marketing landing on someone's real MCP server
  // would be confusing. The landing is reserved for showcase deploys (e.g.
  // mymcp-home) which intentionally set INSTANCE_MODE=showcase OR leave
  // MCP_AUTH_TOKEN unset.
  const hasToken = !!getConfig("MCP_AUTH_TOKEN");
  const mode = getConfig("INSTANCE_MODE");
  const isShowcase = mode === "showcase";

  if (!isShowcase && (mode === "personal" || hasToken)) {
    if (hasToken) {
      redirect("/config");
    }
    // Zero-config flow: send first-time visitors to the welcome page which
    // generates a token via the in-memory bridge. The legacy /setup wizard
    // remains reachable for filesystem dev.
    redirect("/welcome");
  }

  return <LandingPage />;
}
