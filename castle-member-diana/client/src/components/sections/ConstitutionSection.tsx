import { IMAGES, GENERATED_IMAGES } from "@/lib/images";
import { FadeIn } from "./FadeIn";

export function ConstitutionSection() {
  return (
    <section id="the-system" className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0">
        <img
          src={GENERATED_IMAGES.constitutionBg}
          alt=""
          className="w-full h-full object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent" />
      </div>

      <div className="relative z-10 w-full px-8 md:px-16 lg:px-24 py-24">
        <FadeIn>
          <p
            className="text-lg text-gold uppercase tracking-widest font-semibold mb-6"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            The Foundation
          </p>
        </FadeIn>

        <FadeIn delay={0.15}>
          <h2
            className="text-5xl sm:text-6xl md:text-7xl font-bold mb-12 leading-tight text-bone max-w-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            The Metacanon Constitution
          </h2>
        </FadeIn>

        <FadeIn delay={0.3}>
          <div className="max-w-2xl space-y-6">
            <p className="text-lg md:text-xl leading-relaxed text-ash">
              What if AI agents had a constitution? Not a set of rules, but a genuine
              governance framework — one that enshrines human primacy, demands transparency,
              and requires every agent to operate with presence.
            </p>
            <p className="text-lg md:text-xl leading-relaxed text-ash">
              The <span className="text-bone">Metacanon Constitution v3.0</span> was validated by 21 AI agents
              embodying historical philosophers and spiritual teachers. It's not speculative.
              It's a real legal document, developed by real people facing real-life challenges.
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.45}>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl">
            {[
              { label: "Human Primacy", desc: "Humans retain ultimate authority over all AI decisions" },
              { label: "Transparency", desc: "Every agent action is auditable and explainable" },
              { label: "Presence", desc: "Governance begins with awareness, not automation" },
            ].map((item, i) => (
              <div key={i} className="border-l-[3px] border-gold pl-4">
                <p className="text-bone font-semibold mb-1" style={{ fontFamily: "var(--font-mono)" }}>
                  {item.label}
                </p>
                <p className="text-sm text-ash leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </FadeIn>

        <FadeIn delay={0.6}>
          <a
            href="https://www.metacanon.net"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-8 text-sm text-gold uppercase tracking-widest hover:text-bone transition-colors"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Read the Constitution →
          </a>
        </FadeIn>
      </div>
    </section>
  );
}
