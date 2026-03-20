import { IMAGES } from "@/lib/images";
import { FadeIn } from "./FadeIn";

export function ExploringSection() {
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
                Still Going
              </p>
            </FadeIn>

            <FadeIn delay={0.15}>
              <h2
                className="text-5xl sm:text-6xl md:text-7xl font-bold mb-12 leading-tight text-bone"
                style={{ fontFamily: "var(--font-display)" }}
              >
                The rabbit hole keeps going.
              </h2>
            </FadeIn>

            <FadeIn delay={0.3}>
              <div className="space-y-6">
                <p className="text-lg md:text-xl leading-relaxed text-ash">
                  What you've seen here is the surface. Beneath each domain is a living system —
                  agents deliberating, constitutions enforcing, intelligence compounding.
                </p>
                <p className="text-lg md:text-xl leading-relaxed text-ash">
                  I'm still building. Still exploring. Still going deeper into the question
                  of what happens when you give AI systems a <span className="text-bone">soul</span>.
                </p>
                <p className="text-lg md:text-xl leading-relaxed text-ash">
                  If any of these questions are keeping you up at night too,
                  I'd love to hear about it.
                </p>
              </div>
            </FadeIn>
          </div>

          <FadeIn delay={0.3} direction="right">
            <div className="relative">
              <img
                src={IMAGES.exploring}
                alt="Exploring"
                className="w-full max-w-md mx-auto rounded-sm opacity-70"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
