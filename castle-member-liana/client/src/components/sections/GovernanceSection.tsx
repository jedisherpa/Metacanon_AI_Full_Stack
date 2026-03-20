import { IMAGES } from "@/lib/images";
import { FadeIn } from "./FadeIn";

export function GovernanceSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-void to-background" />

      <div className="relative z-10 w-full px-8 md:px-16 lg:px-24 py-24">
        <FadeIn>
          <p
            className="text-lg text-gold uppercase tracking-widest font-semibold mb-6"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Constitution as Code
          </p>
        </FadeIn>

        <FadeIn delay={0.15}>
          <h2
            className="text-5xl sm:text-6xl md:text-7xl font-bold mb-12 leading-tight text-bone max-w-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            OpenClaw
          </h2>
        </FadeIn>

        <FadeIn delay={0.3}>
          <div className="max-w-2xl space-y-6">
            <p className="text-lg md:text-xl leading-relaxed text-ash">
              Philosophy is beautiful. But philosophy that can't be enforced is just poetry.
              So I turned the Constitution into code.
            </p>
            <p className="text-lg md:text-xl leading-relaxed text-ash">
              <span className="text-bone">govclaw.com</span> — the Metacanon Constitution codified as
              machine-readable JSON. Over 1,000 passing rule checks. Sub-millisecond latency.
              Every principle, every governance layer, every ethical boundary — executable.
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.45}>
          <div className="mt-12 flex flex-wrap gap-4">
            {["1,000+ Rule Checks", "Sub-ms Latency", "Machine-Readable JSON", "Open Source"].map((tag, i) => (
              <span
                key={i}
                className="px-4 py-2 text-sm text-gold border border-gold/20 bg-gold/[0.05]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {tag}
              </span>
            ))}
          </div>
        </FadeIn>

        <FadeIn delay={0.6}>
          <a
            href="https://www.govclaw.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-8 text-sm text-gold uppercase tracking-widest hover:text-bone transition-colors"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Explore OpenClaw →
          </a>
        </FadeIn>
      </div>
    </section>
  );
}
