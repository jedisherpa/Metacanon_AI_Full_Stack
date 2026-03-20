import { IMAGES } from "@/lib/images";
import { FadeIn } from "./FadeIn";

export function SphereSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-void to-background" />

      <div className="relative z-10 w-full px-8 md:px-16 lg:px-24 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <FadeIn>
              <p
                className="text-lg text-gold uppercase tracking-widest font-semibold mb-6"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                The Tool
              </p>
            </FadeIn>

            <FadeIn delay={0.15}>
              <h2
                className="text-5xl sm:text-6xl md:text-7xl font-bold mb-12 leading-tight text-bone"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Sphere AI
              </h2>
            </FadeIn>

            <FadeIn delay={0.3}>
              <div className="space-y-6">
                <p className="text-lg md:text-xl leading-relaxed text-ash">
                  A local-first, LLM-agnostic cognitive companion. Your thoughts stay on your
                  machine. Your models run on your terms. Your intelligence remains sovereign.
                </p>
                <p className="text-lg md:text-xl leading-relaxed text-ash">
                  Sphere AI isn't another chatbot. It's the <span className="text-bone">foundation layer</span> —
                  the tool that makes everything else possible.
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={0.45}>
              <a
                href="https://www.sphereai.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-8 text-sm text-gold uppercase tracking-widest hover:text-bone transition-colors"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Discover Sphere AI →
              </a>
            </FadeIn>
          </div>

          <FadeIn delay={0.3} direction="right">
            <div className="relative">
              <img
                src={IMAGES.sphere}
                alt="Sphere AI"
                className="w-full max-w-md mx-auto rounded-sm opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
