import { redirect } from "next/navigation";
import { isFirstRunMode, isBootstrapActive } from "@/core/first-run";
import WelcomeClient from "./welcome-client";

export const dynamic = "force-dynamic";

export default function WelcomePage() {
  // If we already have a permanent token (Vercel env var set, no in-memory
  // bootstrap), there's nothing to do here — the user should be on /config.
  if (!isFirstRunMode() && !isBootstrapActive()) {
    redirect("/config");
  }

  return <WelcomeClient initialBootstrap={isBootstrapActive()} />;
}
