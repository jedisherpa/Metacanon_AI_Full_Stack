import { IMAGES, GENERATED_IMAGES } from "@/lib/images";
import { FadeIn } from "./FadeIn";

export function PresenceSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0">
        <img
          src={GENERATED_IMAGES.presenceBg}
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
            The Philosophy
          </p>
        </FadeIn>

        <FadeIn delay={0.15}>
          <h2
            className="text-5xl sm:text-6xl md:text-7xl font-bold mb-12 leading-tight text-bone max-w-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Presence, Not Hustle
          </h2>
        </FadeIn>

        <FadeIn delay={0.3}>
          <div className="max-w-2xl space-y-6">
            <p className="text-lg md:text-xl leading-relaxed text-ash">
              The tech industry worships speed. Ship fast. Move fast. Break things.
              But what if the most powerful thing you could do is <span className="text-bone">slow down</span>?
            </p>
            <p className="text-lg md:text-xl leading-relaxed text-ash">
              Every system I build starts with stillness. Every governance decision begins
              with awareness. The Metacanon Constitution doesn't just govern AI — it demands
              that the humans governing AI be present, awake, and intentional.
            </p>
            <p className="text-lg md:text-xl leading-relaxed text-ash">
              This isn't productivity advice. It's an <span className="text-bone">operating principle</span>.
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.45}>
          <div className="mt-12 border-l-[3px] border-gold pl-6 max-w-xl">
            <p
              className="text-xl md:text-2xl text-bone italic leading-relaxed"
              style={{ fontFamily: "var(--font-display)" }}
            >
              "The most important technology decisions are governance decisions,
              and governance begins with presence."
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
