import { IMAGES, GENERATED_IMAGES } from "@/lib/images";
import { FadeIn } from "./FadeIn";

const ecosystemData = [
  { metric: "Web Properties Built", value: "20+", detail: "Across 7 functional layers" },
  { metric: "Time to Deploy", value: "~7 Days", detail: "From concept to live production" },
  { metric: "Traditional Equivalent", value: "~$2.1M", detail: "Estimated agency cost" },
  { metric: "Actual Cost", value: "~$7,200", detail: "API costs + infrastructure" },
];

export function EcosystemSection() {
  return (
    <section id="the-work" className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0">
        <img
          src={GENERATED_IMAGES.ecosystemBg}
          alt=""
          className="w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/90" />
      </div>

      <div className="relative z-10 w-full px-8 md:px-16 lg:px-24 py-24">
        <FadeIn>
          <p
            className="text-lg text-gold uppercase tracking-widest font-semibold mb-6"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            The Build
          </p>
        </FadeIn>

        <FadeIn delay={0.15}>
          <h2
            className="text-5xl sm:text-6xl md:text-7xl font-bold mb-6 leading-tight text-bone max-w-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            The 7-Day Ecosystem
          </h2>
        </FadeIn>

        <FadeIn delay={0.25}>
          <p className="text-lg md:text-xl leading-relaxed text-ash max-w-2xl mb-12">
            In approximately one week, using constitutionally-governed AI agents,
            I built a sovereign ecosystem of 20+ web properties across 7 functional layers.
            Here's what that looks like in numbers.
          </p>
        </FadeIn>

        {/* Comparison Table */}
        <div className="max-w-3xl">
          {ecosystemData.map((item, i) => (
            <FadeIn key={i} delay={0.35 + i * 0.1}>
              <div className="border-t border-white/10 py-6 grid grid-cols-3 gap-4 items-baseline">
                <p className="text-sm text-ash uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>
                  {item.metric}
                </p>
                <p
                  className="text-3xl md:text-4xl font-bold text-bone"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {item.value}
                </p>
                <p className="text-sm text-ash/60">{item.detail}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Bridge Sentence — Change 5 */}
        <FadeIn delay={0.65}>
          <p
            className="text-2xl md:text-3xl text-bone font-semibold mt-8 mb-4"
            style={{ fontFamily: "var(--font-display)" }}
          >
            I built this for my own ecosystem.{" "}
            <span className="text-gold" style={{ textShadow: "0 0 20px oklch(0.78 0.12 85 / 0.2)" }}>
              I can build it for yours.
            </span>
          </p>
        </FadeIn>

        {/* Footer Summary */}
        <FadeIn delay={0.75}>
          <div className="border-t border-white/10 pt-8 mt-4">
            <p className="text-ash leading-relaxed max-w-2xl">
              Every property in this ecosystem is governed by the same constitution,
              built with the same tools, and deployed from the same sovereign infrastructure.
              This isn't a portfolio — it's proof of concept at scale.
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
