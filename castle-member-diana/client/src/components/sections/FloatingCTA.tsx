import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function FloatingCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const ecosystemEl = document.getElementById("the-work");
      const closingEl = document.getElementById("lets-talk");

      if (!ecosystemEl || !closingEl) return;

      const ecosystemBottom = ecosystemEl.getBoundingClientRect().bottom;
      const closingTop = closingEl.getBoundingClientRect().top;
      const viewportHeight = window.innerHeight;

      // Show after scrolling past ecosystem, hide when closing is in view
      const pastEcosystem = ecosystemBottom < 0;
      const closingVisible = closingTop < viewportHeight;

      setVisible(pastEcosystem && !closingVisible);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.a
          href="#lets-talk"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3, ease: [0.25, 0.4, 0.25, 1] }}
          className="fixed bottom-8 right-8 z-40 px-6 py-3 text-sm text-gold uppercase tracking-widest border border-gold/30 hover:border-gold hover:shadow-[0_0_20px_oklch(0.78_0.12_85_/_0.2)] transition-all"
          style={{
            fontFamily: "var(--font-mono)",
            backgroundColor: "oklch(0.15 0.005 285 / 0.9)",
            backdropFilter: "blur(8px)",
          }}
        >
          Let's Talk →
        </motion.a>
      )}
    </AnimatePresence>
  );
}
