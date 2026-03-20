import { FadeIn } from "./FadeIn";

const audiences = [
  {
    text: `If you're a founder building something that matters and you need a technical co-pilot who thinks in systems, not features — someone who can deploy AI agents governed by real principles, not just prompts...`,
  },
  {
    text: `If your company is navigating the AI transition and you need someone who's already built the governance layer most people skip — the constitutional framework that makes AI systems trustworthy at scale...`,
  },
  {
    text: `If you're a family seeking sovereign, private intelligence infrastructure that you own and control — built on principles of human primacy, transparency, and local-first architecture...`,
  },
];

export function WhoThisIsForSection() {
  return (
    <section id="who-this-is-for" className="relative overflow-hidden">
      <div className="relative z-10 w-full px-8 md:px-16 lg:px-24 py-24 md:py-32">
        <div className="max-w-3xl mx-auto">
          <FadeIn>
            <p
              className="text-lg text-gold uppercase tracking-widest font-semibold mb-12 text-center"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              This might be for you
            </p>
          </FadeIn>

          <div className="space-y-10">
            {audiences.map((item, i) => (
              <FadeIn key={i} delay={0.15 + i * 0.15}>
                <div className="border-l-[3px] border-gold pl-6">
                  <p className="text-lg md:text-xl leading-relaxed text-ash">
                    {item.text}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={0.6}>
            <p className="mt-12 text-center text-ash italic">
              Keep scrolling to see the full picture. Or jump to{" "}
              <a
                href="#what-i-do"
                className="text-gold hover:text-bone transition-colors"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                what I do for people
              </a>
              .
            </p>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
