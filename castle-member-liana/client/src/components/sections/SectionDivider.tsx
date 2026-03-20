import { motion, useInView } from "framer-motion";
import { useRef } from "react";

export function SectionDivider() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-20px" });

  return (
    <div ref={ref} className="flex justify-center px-4 py-10 sm:px-6 lg:px-8">
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={isInView ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
        transition={{ duration: 1, ease: [0.25, 0.4, 0.25, 1] }}
        className="h-px w-full max-w-5xl rounded-full bg-[linear-gradient(90deg,transparent,rgba(214,179,95,0.55),rgba(83,183,176,0.22),transparent)]"
        style={{ transformOrigin: "center" }}
      />
    </div>
  );
}
