import LandingHeader from "./header";
import Hero from "./hero";
import HowItWorks from "./how-it-works";
import Connectors from "./connectors";
import Features from "./features";
import Compatibility from "./compatibility";
import CtaSection from "./cta-section";
import LandingFooter from "./footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <LandingHeader />
      <main>
        {/* Narrative arc: what it is → how it works (3 steps) → what you
            can plug in (14 connectors, 86 tools) → why this vs DIY
            (features) → where you can use it (compat clients) → deploy
            now (CTA). Each section adds a concrete layer after the hero
            so a cold visitor walks from "cool idea" to "ready to click". */}
        <Hero />
        <HowItWorks />
        <Connectors />
        <Features />
        <Compatibility />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
