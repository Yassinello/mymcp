import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LandingPage from "./landing/landing-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MyMCP — Your Personal MCP Server",
  description:
    "One Vercel deploy. 65+ tools. Your data, your keys. MyMCP is the open source personal MCP server that gives your AI assistant access to calendar, email, GitHub, and more.",
  openGraph: {
    title: "MyMCP — Your Personal MCP Server",
    description: "Open source. MIT licensed. One deploy, 65+ tools, zero ongoing cost.",
  },
};

export default function HomePage() {
  if (process.env.INSTANCE_MODE === "personal") {
    if (process.env.MCP_AUTH_TOKEN) {
      redirect("/config");
    }
    // Zero-config flow: send first-time visitors to the welcome page which
    // generates a token via the in-memory bridge. The legacy /setup wizard
    // remains reachable for filesystem dev.
    redirect("/welcome");
  }

  return <LandingPage />;
}
