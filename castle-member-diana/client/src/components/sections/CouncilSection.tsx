import { IMAGES } from "@/lib/images";
import { FadeIn } from "./FadeIn";

export function CouncilSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-void to-background" />

      <div className="relative z-10 w-full px-8 md:px-16 lg:px-24 py-24">
        <FadeIn>
          <p
            className="text-lg text-gold uppercase tracking-widest font-semibold mb-6"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            The Intelligence
          </p>
        </FadeIn>

        <FadeIn delay={0.15}>
          <h2
            className="text-5xl sm:text-6xl md:text-7xl font-bold mb-12 leading-tight text-bone max-w-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            fisheye.news
          </h2>
        </FadeIn>

        <FadeIn delay={0.3}>
          <div className="max-w-2xl space-y-6">
            <p className="text-lg md:text-xl leading-relaxed text-ash">
              A 12-agent AI council that deliberates on the news. Not summarizes — <span className="text-bone">deliberates</span>.
              Each agent brings a different perspective. They argue. They synthesize. They produce
              intelligence, not information.
            </p>
            <p className="text-lg md:text-xl leading-relaxed text-ash">
              Imagine a room of 12 brilliant analysts, each with a different worldview,
              debating every major story in real-time. That's fisheye.news.
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.45}>
          <div className="mt-12 flex items-center gap-6">
            <img
              src={IMAGES.council}
              alt="The Council"
              className="w-16 h-16 rounded-full object-cover border border-white/10"
            />
            <div>
              <p className="text-bone font-semibold">12 AI Agents</p>
              <p className="text-sm text-ash">Constitutional governance in action</p>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.6}>
          <a
            href="https://www.fisheye.news"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-8 text-sm text-gold uppercase tracking-widest hover:text-bone transition-colors"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Read the Council →
          </a>
        </FadeIn>
      </div>
    </section>
  );
}
