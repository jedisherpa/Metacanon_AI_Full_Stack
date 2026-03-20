import { FadeIn } from "./FadeIn";

const experiences = [
  {
    name: "Hands of the Void",
    url: "https://www.handsofthevoid.com",
    desc: "An interactive experience that explores the boundary between human intention and AI creation.",
  },
  {
    name: "The Antechamber",
    url: "https://www.antechamber.art",
    desc: "A liminal space — the threshold between the known and the unknown. Enter at your own pace.",
  },
  {
    name: "Consciousness Architect",
    url: "https://www.consciousnessarchitect.com",
    desc: "The gateway to understanding how awareness and technology intersect.",
  },
  {
    name: "The Deliberation Hub",
    url: "https://www.metacanon.website",
    desc: "Watch constitutional deliberation in action. See how AI agents govern themselves.",
  },
];

export function ExperiencesSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-void to-background" />

      <div className="relative z-10 w-full px-8 md:px-16 lg:px-24 py-24">
        <FadeIn>
          <p
            className="text-lg text-gold uppercase tracking-widest font-semibold mb-6"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            The Experiences
          </p>
        </FadeIn>

        <FadeIn delay={0.15}>
          <h2
            className="text-5xl sm:text-6xl md:text-7xl font-bold mb-6 leading-tight text-bone max-w-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Step Inside
          </h2>
        </FadeIn>

        <FadeIn delay={0.25}>
          <p className="text-lg md:text-xl leading-relaxed text-ash max-w-2xl mb-16">
            These aren't just websites. They're interactive entry points into the ecosystem —
            each one a different doorway into the same underlying intelligence.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
          {experiences.map((exp, i) => (
            <FadeIn key={i} delay={0.35 + i * 0.1}>
              <a
                href={exp.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-6 border border-white/[0.05] hover:border-gold/20 transition-all group bg-gold/[0.02] hover:bg-gold/[0.05]"
              >
                <h3
                  className="text-xl font-bold text-bone group-hover:text-gold transition-colors mb-3"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {exp.name}
                </h3>
                <p className="text-ash leading-relaxed text-sm">{exp.desc}</p>
                <p
                  className="mt-4 text-sm text-gold/60 group-hover:text-gold transition-colors uppercase tracking-widest"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  Enter →
                </p>
              </a>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
