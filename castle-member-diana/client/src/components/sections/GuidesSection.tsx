import { FadeIn } from "./FadeIn";

const guides = [
  {
    name: "Jedi Sherpa",
    role: "The Mentor",
    description: "Wisdom traditions meet AI coaching. For those who want to build with presence and purpose.",
    url: "https://www.jedisherpa.com",
  },
  {
    name: "Wizard Joe",
    role: "The Master Artisan",
    description: "The premium consulting layer. Strategic sessions, intensive builds, and ongoing advisory partnerships.",
    url: "https://www.wizardjoe.com",
  },
  {
    name: "Feral Pharaoh",
    role: "The Artist",
    description: "The creative edge. Where AI meets art, mythology, and the raw energy of creation.",
    url: "https://www.feralpharaoh.com",
  },
];

export function GuidesSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-void to-background" />

      <div className="relative z-10 w-full px-8 md:px-16 lg:px-24 py-24">
        <FadeIn>
          <p
            className="text-lg text-gold uppercase tracking-widest font-semibold mb-6"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            The Guides
          </p>
        </FadeIn>

        <FadeIn delay={0.15}>
          <h2
            className="text-5xl sm:text-6xl md:text-7xl font-bold mb-6 leading-tight text-bone max-w-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Three Faces of the Work
          </h2>
        </FadeIn>

        <FadeIn delay={0.25}>
          <p className="text-lg md:text-xl leading-relaxed text-ash max-w-2xl mb-16">
            The ecosystem expresses itself through three distinct guides — each with its own
            voice, its own audience, and its own way of serving.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-5xl">
          {guides.map((guide, i) => (
            <FadeIn key={i} delay={0.35 + i * 0.15}>
              <div className="border-t border-white/10 pt-8">
                <p
                  className="text-sm text-gold uppercase tracking-widest mb-3"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {guide.role}
                </p>
                <h3
                  className="text-2xl md:text-3xl font-bold text-bone mb-4"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {guide.name}
                </h3>
                <p className="text-ash leading-relaxed mb-6">{guide.description}</p>
                <a
                  href={guide.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gold uppercase tracking-widest hover:text-bone transition-colors"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  Visit →
                </a>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
