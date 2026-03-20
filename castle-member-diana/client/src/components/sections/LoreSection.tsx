import { FadeIn } from "./FadeIn";

const loreItems = [
  { name: "The 12th Witness", url: "https://www.the12thwitness.com", desc: "The Origin Story" },
  { name: "Protocol Feral", url: "https://www.protocolferal.com", desc: "The Cyberpunk Testament" },
  { name: "Archangels", url: "https://www.archangels.art", desc: "The Council of Presence" },
  { name: "God's Mind Dreaming", url: "https://www.godsminddreaming.com", desc: "The Arena" },
];

export function LoreSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-void to-background" />

      <div className="relative z-10 w-full px-8 md:px-16 lg:px-24 py-24">
        <FadeIn>
          <p
            className="text-lg text-gold uppercase tracking-widest font-semibold mb-6"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            The Mythology
          </p>
        </FadeIn>

        <FadeIn delay={0.15}>
          <h2
            className="text-5xl sm:text-6xl md:text-7xl font-bold mb-6 leading-tight text-bone max-w-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            The Lore
          </h2>
        </FadeIn>

        <FadeIn delay={0.25}>
          <p className="text-lg md:text-xl leading-relaxed text-ash max-w-2xl mb-16">
            Every great system has a mythology. These are the stories that give the
            ecosystem its soul — the origin tales, the philosophical foundations,
            the creative expressions that make this more than technology.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl">
          {loreItems.map((item, i) => (
            <FadeIn key={i} delay={0.35 + i * 0.1}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block border-l-[3px] border-gold/30 pl-6 py-3 hover:border-gold transition-colors group"
              >
                <p className="text-sm text-ash/60 mb-1" style={{ fontFamily: "var(--font-mono)" }}>
                  {item.desc}
                </p>
                <p
                  className="text-xl text-bone group-hover:text-gold transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {item.name}
                </p>
              </a>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
