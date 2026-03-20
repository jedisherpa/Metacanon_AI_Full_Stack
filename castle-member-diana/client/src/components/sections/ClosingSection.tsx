import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IMAGES } from "@/lib/images";
import { FadeIn } from "./FadeIn";

const constellationLinks = [
  { name: "metacanon.net", url: "https://www.metacanon.net" },
  { name: "govclaw.com", url: "https://www.govclaw.com" },
  { name: "sphereai.dev", url: "https://www.sphereai.dev" },
  { name: "fisheye.news", url: "https://www.fisheye.news" },
  { name: "jedisherpa.com", url: "https://www.jedisherpa.com" },
  { name: "wizardjoe.com", url: "https://www.wizardjoe.com" },
  { name: "feralpharaoh.com", url: "https://www.feralpharaoh.com" },
  { name: "paulcooper.agency", url: "https://www.paulcooper.agency" },
  { name: "the12thwitness.com", url: "https://www.the12thwitness.com" },
  { name: "protocolferal.com", url: "https://www.protocolferal.com" },
  { name: "archangels.art", url: "https://www.archangels.art" },
  { name: "godsminddreaming.com", url: "https://www.godsminddreaming.com" },
  { name: "handsofthevoid.com", url: "https://www.handsofthevoid.com" },
  { name: "metacanon.website", url: "https://www.metacanon.website" },
  { name: "antechamber.art", url: "https://www.antechamber.art" },
  { name: "consciousnessarchitect.com", url: "https://www.consciousnessarchitect.com" },
  { name: "paulcooper.ai", url: "https://www.paulcooper.ai" },
  { name: "sovereignai.design", url: "https://www.sovereignai.design" },
  { name: "suckmymarketing.com", url: "https://www.suckmymarketing.com" },
  { name: "re-self.com", url: "https://www.re-self.com" },
];

export function ClosingSection() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section id="lets-talk" className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-void to-background" />

      <div className="relative z-10 w-full px-8 md:px-16 lg:px-24 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start max-w-5xl">
          {/* Portrait Column */}
          <FadeIn>
            <div className="flex flex-col items-center lg:items-start">
              <div className="relative mb-8">
                <img
                  src={IMAGES.portrait}
                  alt="Paul Cooper"
                  className="w-48 h-48 md:w-64 md:h-64 rounded-full object-cover border-2 border-gold/20"
                  style={{ boxShadow: "0 0 40px oklch(0.78 0.12 85 / 0.15)" }}
                />
              </div>

              {/* About paragraph — Change 4a */}
              <p className="text-ash text-base md:text-lg leading-relaxed max-w-xl mb-8">
                I've spent the last decade at the intersection of wisdom traditions, startup
                culture, plant medicine circles, and personal development. Studying governance
                and putting it into practice with 3 others, Anna a Lawyer, Diana a Therapist,
                and Max a Coder. The Metacanon Constitution was born from that convergence:
                the belief that the most important group decisions are governance decisions,
                and that governance begins with presence. Now I apply that thinking to Agents.
              </p>
            </div>
          </FadeIn>

          {/* CTA Column */}
          <div>
            <FadeIn delay={0.15}>
              <h2
                className="text-4xl sm:text-5xl md:text-6xl font-bold mb-8 leading-tight text-bone"
                style={{ fontFamily: "var(--font-display)" }}
              >
                What are you building?
              </h2>
            </FadeIn>

            <FadeIn delay={0.3}>
              <p className="text-lg md:text-xl leading-relaxed text-ash mb-8">
                If something here resonated — if you're building something that matters
                and you want to talk about it — I'd love to hear from you.
              </p>
            </FadeIn>

            <FadeIn delay={0.45}>
              <div>
                <a
                  href="mailto:paul@wizardjoe.com"
                  className="text-2xl md:text-3xl text-gold font-semibold hover:text-bone transition-colors"
                  style={{
                    fontFamily: "var(--font-display)",
                    textShadow: "0 0 20px oklch(0.78 0.12 85 / 0.2)",
                  }}
                >
                  paul@wizardjoe.com
                </a>
                {/* Confidence line — Change 4b */}
                <p
                  className="text-sm text-ash/60 mt-3"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  All inquiries are held in strict confidence.
                </p>
              </div>
            </FadeIn>
          </div>
        </div>

        {/* Collapsible Constellation — Change 4c */}
        <FadeIn delay={0.6}>
          <div className="mt-20 max-w-5xl">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sm text-ash uppercase tracking-widest border border-white/10 py-3 px-6 hover:border-gold/30 hover:text-gold transition-colors"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Explore the Full Constellation — 20 Worlds {isExpanded ? "▴" : "▾"}
            </button>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mt-8">
                    {constellationLinks.map((link, i) => (
                      <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block py-3 px-4 border border-white/[0.05] hover:border-gold/30 transition-colors text-sm text-bone hover:text-gold"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {link.name}
                      </a>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
