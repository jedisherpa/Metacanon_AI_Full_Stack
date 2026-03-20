import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const navLinks = [
  { label: "The Work", href: "#the-work" },
  { label: "The System", href: "#the-system" },
  { label: "The Proof", href: "#the-proof" },
  { label: "Let's Talk", href: "#lets-talk" },
];

export function StickyNav() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > window.innerHeight * 0.8);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.nav
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: [0.25, 0.4, 0.25, 1] }}
          className="fixed top-0 left-0 right-0 z-50 h-12 flex items-center justify-center gap-8 md:gap-12 border-b border-white/[0.05]"
          style={{
            backgroundColor: "oklch(0.08 0.005 285 / 0.9)",
            backdropFilter: "blur(8px)",
          }}
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-gold uppercase tracking-widest hover:text-bone transition-colors"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {link.label}
            </a>
          ))}
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
