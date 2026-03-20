import { IMAGES, GENERATED_IMAGES } from "@/lib/images";
import { FadeIn } from "./FadeIn";

export function SovereigntySection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0">
        <img
          src={GENERATED_IMAGES.sovereigntyBg}
          alt=""
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/90" />
      </div>

      <div className="relative z-10 w-full px-8 md:px-16 lg:px-24 py-24">
        <FadeIn>
          <p
            className="text-lg text-gold uppercase tracking-widest font-semibold mb-6"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            The Crisis
          </p>
        </FadeIn>

        <FadeIn delay={0.15}>
          <h2
            className="text-5xl sm:text-6xl md:text-7xl font-bold mb-12 leading-tight text-bone max-w-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Is your mind truly your own?
          </h2>
        </FadeIn>

        <FadeIn delay={0.3}>
          <div className="max-w-2xl space-y-6">
            <p className="text-lg md:text-xl leading-relaxed text-ash">
              Every day, billions of people hand their most intimate thoughts to AI systems
              they don't own, can't inspect, and have no governance over. Your conversations,
              your creative process, your strategic thinking — all flowing into corporate
              servers, training models you'll never control.
            </p>
            <p className="text-lg md:text-xl leading-relaxed text-ash">
              This isn't a privacy problem. It's a <span className="text-bone">sovereignty crisis</span>.
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.45}>
          <div className="mt-12 flex items-center gap-6">
            <img
              src={IMAGES.sovereignty}
              alt="Sovereignty"
              className="w-16 h-16 rounded-full object-cover border border-white/10"
            />
            <p className="text-sm text-ash/60" style={{ fontFamily: "var(--font-mono)" }}>
              The question that started everything.
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
