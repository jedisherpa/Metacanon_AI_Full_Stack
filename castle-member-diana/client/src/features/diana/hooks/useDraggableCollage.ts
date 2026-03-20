import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createCollageLayout } from "../shell";
import type { CollageCardPlacement, CollageViewDefinition } from "../types";

type DragState = {
  cardId: string;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

export function useDraggableCollage(view: CollageViewDefinition, isMobile: boolean) {
  const baselineLayout = useMemo(() => createCollageLayout(view, isMobile), [view, isMobile]);
  const [positions, setPositions] = useState<Record<string, CollageCardPlacement>>(baselineLayout);
  const positionsRef = useRef(positions);
  const dragStateRef = useRef<DragState | null>(null);

  useEffect(() => {
    setPositions(baselineLayout);
  }, [baselineLayout]);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  const resetPositions = () => {
    dragStateRef.current = null;
    setPositions(baselineLayout);
  };

  const bindCard = (cardId: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }

      const current = positionsRef.current[cardId];
      if (!current) {
        return;
      }

      dragStateRef.current = {
        cardId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: current.x,
        originY: current.y,
      };

      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.cardId !== cardId || dragState.pointerId !== event.pointerId) {
        return;
      }

      const nextX = dragState.originX + (event.clientX - dragState.startX);
      const nextY = dragState.originY + (event.clientY - dragState.startY);

      setPositions((current) => ({
        ...current,
        [cardId]: {
          ...current[cardId],
          x: nextX,
          y: nextY,
        },
      }));
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.cardId !== cardId || dragState.pointerId !== event.pointerId) {
        return;
      }

      dragStateRef.current = null;

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released.
      }
    },
    onPointerCancel: () => {
      dragStateRef.current = null;
    },
  });

  return {
    positions,
    resetPositions,
    bindCard,
  };
}
