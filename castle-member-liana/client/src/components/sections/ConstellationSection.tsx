import { FadeIn } from "./FadeIn";

const layers = [
  {
    name: "Foundation",
    domains: [
      { name: "metacanon.net", label: "The Philosophy" },
      { name: "govclaw.com", label: "Constitution as Code" },
      { name: "sphereai.dev", label: "The Foundation Tool" },
    ],
  },
  {
    name: "Application",
    domains: [
      { name: "fisheye.news", label: "The Intelligence" },
    ],
  },
  {
    name: "Guide",
    domains: [
      { name: "jedisherpa.com", label: "The Mentor" },
      { name: "wizardjoe.com", label: "The Master Artisan" },
      { name: "feralpharaoh.com", label: "The Artist" },
      { name: "paulcooper.agency", label: "The White Space" },
    ],
  },
  {
    name: "Lore",
    domains: [
      { name: "the12thwitness.com", label: "The Origin Story" },
      { name: "protocolferal.com", label: "The Cyberpunk Testament" },
      { name: "archangels.art", label: "The Council of Presence" },
      { name: "godsminddreaming.com", label: "The Arena" },
    ],
  },
  {
    name: "Experience",
    domains: [
      { name: "handsofthevoid.com", label: "The Game" },
      { name: "metacanon.website", label: "The Deliberation Hub" },
      { name: "antechamber.art", label: "The Antechamber" },
      { name: "consciousnessarchitect.com", label: "The Gateway" },
    ],
  },
  {
    name: "Identity",
    domains: [
      { name: "paulcooper.ai", label: "The Sacred Gallery" },
      { name: "sovereignai.design", label: "The Map" },
    ],
  },
  {
    name: "Proof",
    domains: [
      { name: "suckmymarketing.com", label: "The Case Study" },
    ],
  },
];

export function ConstellationSection() {
  return (
    <section id="the-proof" className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-void to-background" />

      <div className="relative z-10 w-full px-8 md:px-16 lg:px-24 py-24">
        <FadeIn>
          <p
            className="text-lg text-gold uppercase tracking-widest font-semibold mb-6"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            The Constellation
          </p>
        </FadeIn>

        <FadeIn delay={0.15}>
          <h2
            className="text-5xl sm:text-6xl md:text-7xl font-bold mb-6 leading-tight text-bone max-w-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            20 Worlds. 7 Layers.
          </h2>
        </FadeIn>

        <FadeIn delay={0.25}>
          <p className="text-lg md:text-xl leading-relaxed text-ash max-w-2xl mb-16">
            The full sovereign AI ecosystem — every domain, every function, every layer.
            Built in approximately one week. Governed by one constitution.
          </p>
        </FadeIn>

        <div className="space-y-10 max-w-4xl">
          {layers.map((layer, i) => (
            <FadeIn key={i} delay={0.3 + i * 0.08}>
              <div>
                <p
                  className="text-sm text-gold uppercase tracking-widest mb-4"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {layer.name} Layer
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {layer.domains.map((domain, j) => (
                    <a
                      key={j}
                      href={`https://${domain.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block py-3 px-4 border border-white/[0.05] hover:border-gold/30 transition-colors group"
                    >
                      <p className="text-sm text-bone group-hover:text-gold transition-colors" style={{ fontFamily: "var(--font-mono)" }}>
                        {domain.name}
                      </p>
                      <p className="text-xs text-ash/50 mt-1">{domain.label}</p>
                    </a>
                  ))}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
