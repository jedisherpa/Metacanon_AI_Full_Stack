import { FadeIn } from "./FadeIn";

const tiers = [
  {
    title: "A Conversation",
    body: "Sometimes it starts with a single call. You tell me what you're building, I tell you what I see. No pitch, no proposal — just clarity.",
    elevated: false,
  },
  {
    title: "A Build Sprint",
    body: "Other times, we go deep. In a week, I deploy my agents and we build your system together. Not a plan — a working, living ecosystem.",
    elevated: false,
  },
  {
    title: "A Partnership",
    body: "For a small number of people each year, I offer an ongoing, private advisory relationship. We build, iterate, and govern together.",
    elevated: true,
  },
];

export function WhatIDoSection() {
  return (
    <section id="what-i-do" className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-void to-background" />

      <div className="relative z-10 w-full px-8 md:px-16 lg:px-24 py-24">
        <FadeIn>
          <p
            className="text-lg text-gold uppercase tracking-widest font-semibold mb-6"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            What I do for people
          </p>
        </FadeIn>

        <FadeIn delay={0.15}>
          <h2
            className="text-5xl sm:text-6xl md:text-7xl font-bold mb-4 leading-tight text-bone max-w-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Sometimes friends ask me to build this for them.
          </h2>
        </FadeIn>

        <FadeIn delay={0.25}>
          <p className="text-lg md:text-xl leading-relaxed text-ash max-w-2xl mb-16">
            Here's what that looks like.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl">
          {tiers.map((tier, i) => (
            <FadeIn key={i} delay={0.35 + i * 0.15}>
              <div
                className={`pt-8 ${
                  tier.elevated
                    ? "border-t-[3px] border-gold bg-gold/[0.03]  px-6 pb-6"
                    : "border-t border-white/10"
                }`}
              >
                <h3
                  className="text-2xl font-bold text-bone mb-4"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {tier.title}
                </h3>
                <p className="text-ash leading-relaxed mb-6">{tier.body}</p>
                <a
                  href="https://www.wizardjoe.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gold uppercase tracking-widest hover:text-bone transition-colors"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  Learn more →
                </a>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.8}>
          <div className="mt-16 border-l-4 border-gold pl-6 max-w-2xl">
            <p
              className="text-xl md:text-2xl text-bone italic leading-relaxed"
              style={{ fontFamily: "var(--font-display)" }}
            >
              "I built my ecosystem in a week. Imagine what we could build for yours."
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
