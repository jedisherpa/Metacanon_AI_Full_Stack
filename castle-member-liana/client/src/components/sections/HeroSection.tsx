import { IMAGES, GENERATED_IMAGES } from "@/lib/images";
import { FadeIn } from "./FadeIn";

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Background image with heavy vignette */}
      <div className="absolute inset-0">
        <img
          src={GENERATED_IMAGES.heroBg}
          alt=""
          className="w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/80" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-transparent to-background/90" />
      </div>

      <div className="relative z-10 w-full px-8 md:px-16 lg:px-24 py-24">
        <FadeIn delay={0.3}>
          <p
            className="text-sm text-gold uppercase tracking-[0.3em] font-medium mb-8"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            A Personal Tour
          </p>
        </FadeIn>

        <FadeIn delay={0.6}>
          <h1
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-8 leading-[1.1] text-bone max-w-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            So, I've Been Busy...
          </h1>
        </FadeIn>

        <FadeIn delay={0.9}>
          <p className="text-lg md:text-xl text-ash leading-relaxed max-w-2xl mb-12">
            A quick tour of what happens when you go down the rabbit hole.
          </p>
        </FadeIn>

        <FadeIn delay={1.2}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-px bg-gold/50" />
            <p
              className="text-sm text-gold/60 uppercase tracking-widest"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Scroll to begin
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
