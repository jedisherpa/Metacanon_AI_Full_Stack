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
      (observerEntries) => {
        const isVisible = observerEntries.some((entry) => entry.isIntersecting);
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
    <div ref={ref} className="prism-liana-panel px-6 py-8 md:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[rgba(245,245,245,0.64)]">
            Wall Of Sovereigns
          </p>
          <h3 className="font-display text-4xl text-radiant-white sm:text-5xl">
            Witness the movement becoming visible in real time.
          </h3>
        </div>
        <p className="max-w-md text-base leading-8 text-[rgba(245,245,245,0.68)]">
          This wall is the social proof beneath the mysticism. When the shared ledger
          is connected, declaration activity from across realms appears here within seconds.
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
            className="prism-liana-panel px-5 py-5"
          >
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.22em] text-sovereign-gold">
              Sovereign
            </p>
            <h4 className="mt-2 text-lg font-semibold text-radiant-white">{entry.label}</h4>
            <p className="mt-1 text-sm leading-6 text-[rgba(245,245,245,0.66)]">
              {entry.subtitle}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
