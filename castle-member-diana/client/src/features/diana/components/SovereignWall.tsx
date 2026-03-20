import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { WallEntry } from "../types";

type SovereignWallProps = {
  entries: WallEntry[];
  onViewed: () => void | Promise<void>;
};

export function SovereignWall({ entries, onViewed }: SovereignWallProps) {
  const ref = useRef<HTMLDivElement>(null);
  const hasViewedRef = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (isVisible && !hasViewedRef.current) {
          hasViewedRef.current = true;
          void onViewed();
        }
      },
      { threshold: 0.25 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [onViewed]);

  return (
    <div
      ref={ref}
      className="border-y border-white/10 py-8"
    >
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[rgba(255,250,205,0.64)]">
            Wall of Sovereigns
          </p>
          <h3 className="font-display text-4xl text-radiant-white sm:text-5xl">
            The wall of luminous breakers is already in motion.
          </h3>
        </div>
        <p className="max-w-md text-base leading-8 text-[rgba(255,250,205,0.68)]">
          These names are rendered as a living threshold. When the shared ledger
          is connected, this wall updates from real declaration activity rather
          than remaining a symbolic chorus.
        </p>
      </div>

      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry, index) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.04, duration: 0.35 }}
            className="border-t border-white/10 pt-4"
          >
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.22em] text-sovereign-gold">
              Signatory
            </p>
            <h4 className="mt-2 text-lg font-semibold text-radiant-white">{entry.label}</h4>
            <p className="mt-1 text-sm leading-6 text-[rgba(255,250,205,0.66)]">{entry.subtitle}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
