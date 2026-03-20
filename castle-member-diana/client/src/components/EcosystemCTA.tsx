import { useEffect } from "react";
import { motion } from "framer-motion";

/**
 * EcosystemCTA — Opt-in component for the Sovereign AI Ecosystem.
 * Uses Go High Level embedded form via iframe.
 * Includes a direct link to the free course on metacanon.website.
 *
 * Source tracking: Appends ?source_site={sourceTag}&course_interest={courseTag}
 * to the GHL iframe src URL so that each lead is tagged with the originating
 * website and course interest for proper email campaign routing.
 *
 * GHL SETUP REQUIRED: In your GHL form builder, add two hidden custom fields:
 *   - "source_site" with Query Key = "source_site"
 *   - "course_interest" with Query Key = "course_interest"
 */

interface EcosystemCTAProps {
  headline: string;
  description: string;
  courseName: string;
  sourceTag: string;
  courseTag: string;
}

const COURSE_TAG_TO_PATH: Record<string, string> = {
  "problem-decomposition": "/learn/problem-decomposition",
  "test-driven-ai": "/learn/test-driven-interaction",
  "ai-safety-checklist": "/learn/ai-safety-checklist",
  "systems-thinking-ai": "/learn/systems-thinking",
  "prompt-refinement": "/learn/prompt-refinement",
  "ai-failure-analysis": "/learn/failure-analysis",
  "refactoring-outputs": "/learn/refactoring-outputs",
  "ai-anatomy": "/learn/ai-anatomy",
  "human-in-the-loop": "/learn/human-in-the-loop",
  "measuring-ai": "/learn/measuring-contribution",
};

const GHL_FORM_BASE = "https://api.leadconnectorhq.com/widget/form/sXVcBxmHlNFt46Sul9nx";

export default function EcosystemCTA({
  headline,
  description,
  courseName,
  sourceTag,
  courseTag,
}: EcosystemCTAProps) {
  const courseUrl = `https://www.metacanon.website${COURSE_TAG_TO_PATH[courseTag] || "/learn"}`;
  const ghlFormUrl = `${GHL_FORM_BASE}?source_site=${encodeURIComponent(sourceTag)}&course_interest=${encodeURIComponent(courseTag)}`;

  useEffect(() => {
    // Load the GHL form embed script
    const existingScript = document.querySelector('script[src="https://link.msgsndr.com/js/form_embed.js"]');
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://link.msgsndr.com/js/form_embed.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  return (
    <section className="py-20 relative overflow-hidden" id="ecosystem-cta">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
      <div className="container relative z-10 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {headline}
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-xl mx-auto">
            {description}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-card/80 backdrop-blur-sm border border-border rounded-2xl p-8"
        >
          <div className="text-center mb-6">
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-3">
              Free Course
            </span>
            <h3 className="text-xl font-semibold text-foreground">{courseName}</h3>
          </div>

          {/* Go High Level Embedded Form — with source tracking params */}
          <div className="w-full rounded-xl overflow-hidden">
            <iframe
              src={ghlFormUrl}
              style={{ width: "100%", height: "431px", border: "none", borderRadius: "3px" }}
              id="inline-sXVcBxmHlNFt46Sul9nx"
              data-layout='{"id":"INLINE"}'
              data-trigger-type="alwaysShow"
              data-trigger-value=""
              data-activation-type="alwaysActivated"
              data-activation-value=""
              data-deactivation-type="neverDeactivate"
              data-deactivation-value=""
              data-form-name="Email Signup"
              data-height="431"
              data-layout-iframe-id="inline-sXVcBxmHlNFt46Sul9nx"
              data-form-id="sXVcBxmHlNFt46Sul9nx"
              title="Email Signup"
            />
          </div>

          {/* Direct Course Link */}
          <div className="text-center mt-6">
            <a
              href={courseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
            >
              Start Your Free Course
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </a>
          </div>

          <p className="text-xs text-muted-foreground text-center mt-4">
            We respect your privacy. Unsubscribe anytime.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
