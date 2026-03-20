import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/useMobile";
import { useDraggableCollage } from "../hooks/useDraggableCollage";
import { selectCollagePlacement } from "../shell";
import type { CollageViewDefinition } from "../types";

type CursorState = {
  x: number;
  y: number;
  visible: boolean;
  expanded: boolean;
};

export function DraggableCollageCanvas({
  view,
}: {
  view: CollageViewDefinition;
}) {
  const isMobile = useIsMobile();
  const { positions, bindCard } = useDraggableCollage(view, isMobile);
  const [isFinePointer, setIsFinePointer] = useState(false);
  const [cursor, setCursor] = useState<CursorState>({
    x: 0,
    y: 0,
    visible: false,
    expanded: false,
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(pointer: fine)");
    const handleChange = () => {
      setIsFinePointer(mediaQuery.matches);
    };

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return (
    <div
      className={`relative h-full w-full ${isFinePointer ? "cursor-none" : ""}`}
      onPointerMove={(event) => {
        if (!isFinePointer) {
          return;
        }

        const bounds = event.currentTarget.getBoundingClientRect();
        setCursor((current) => ({
          ...current,
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
          visible: true,
        }));
      }}
      onPointerLeave={() =>
        setCursor((current) => ({
          ...current,
          visible: false,
          expanded: false,
        }))
      }
    >
      {view.cards.map((card) => {
        const placement = positions[card.id] ?? selectCollagePlacement(card, isMobile);

        return (
          <motion.div
            key={card.id}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="editorial-collage-card absolute touch-none select-none"
            style={{
              left: placement.x,
              top: placement.y,
              width: placement.width,
              height: placement.height,
              rotate: `${placement.rotation}deg`,
              zIndex: placement.zIndex,
            }}
            onPointerEnter={() => {
              if (!isFinePointer) {
                return;
              }

              setCursor((current) => ({
                ...current,
                expanded: true,
              }));
            }}
            onPointerLeave={() => {
              if (!isFinePointer) {
                return;
              }

              setCursor((current) => ({
                ...current,
                expanded: false,
              }));
            }}
            {...bindCard(card.id)}
          >
            <img
              src={card.path}
              alt={card.alt}
              draggable={false}
              loading="lazy"
              decoding="async"
              className="h-full w-full rounded-[1.3rem] object-cover"
              style={{ objectPosition: placement.objectPosition }}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-[1.3rem] bg-gradient-to-t from-black/36 to-transparent px-4 pb-4 pt-8">
              <p className="font-[var(--font-ui)] text-[10px] uppercase tracking-[0.28em] text-white/82">
                {card.caption}
              </p>
            </div>
          </motion.div>
        );
      })}

      <div className="pointer-events-none absolute bottom-6 right-6 z-20 hidden rounded-full border border-black/8 bg-white/88 px-4 py-2 shadow-[0_12px_30px_rgba(15,15,15,0.08)] md:block">
        <p className="font-[var(--font-ui)] text-[10px] uppercase tracking-[0.28em] text-black/55">
          {view.label} · drag to rearrange
        </p>
      </div>

      {isFinePointer && cursor.visible ? (
        <motion.div
          animate={{
            x: cursor.x,
            y: cursor.y,
            scale: cursor.expanded ? 1.28 : 1,
            opacity: cursor.visible ? 1 : 0,
          }}
          transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.2 }}
          className="pointer-events-none absolute left-0 top-0 z-30 -translate-x-1/2 -translate-y-1/2"
        >
          <div className="editorial-cursor flex size-20 items-center justify-center rounded-full">
            <span className="font-[var(--font-ui)] text-[9px] uppercase tracking-[0.3em] text-black/68">
              drag
            </span>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
