import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type React from 'react';

export interface DragSession {
  cardUid: string;
  cardId: number;
  isPermanent: boolean;
  overPermZone: boolean;
}

export interface UseCardDragOptions {
  isEnabled: boolean;
  isNeutralCell: (row: number, col: number) => boolean;
  onDragStart?: (cardUid: string) => void;
  onHoverCellChange?: () => void;
  onDropBoard: (cardUid: string, row: number, col: number) => void;
  onDropPermanent: (cardUid: string) => void;
}

export interface UseCardDragResult {
  dragSession: DragSession | null;
  dragHoverCell: [number, number] | null;
  ghostRef: React.RefObject<HTMLDivElement>;
  startCardPointerDown: (
    params: { cardUid: string; cardId: number; isPermanent: boolean },
    e: React.PointerEvent<HTMLElement>
  ) => void;
  wasJustDragged: () => boolean;
  cancelDrag: () => void;
}

interface ActiveDragInternal {
  cardUid: string;
  cardId: number;
  isPermanent: boolean;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  latestX: number;
  latestHitY: number;
  started: boolean;
  emittedSession: boolean;
  lastHoverKey: string | null;
  lastOverPerm: boolean;
}

const DRAG_THRESHOLD_PX = 10;
const TOUCH_OFFSET_Y_PX = 24;

function applyGhostTransform(el: HTMLDivElement | null, x: number, hitY: number): void {
  if (!el) return;
  el.style.transform = `translate3d(${x}px, ${hitY}px, 0) translate(-50%, -100%)`;
}

/**
 * 120fps pointer drag-and-drop hook for B'n'D cards:
 * - Updates the floating ghost via direct DOM transform (0 React re-renders/frame)
 * - Emits React state updates only when the hovered cell or drop-zone status changes
 * - Locks onto the active pointerId so secondary touches cannot hijack an ongoing drag
 */
export function useCardDrag(options: UseCardDragOptions): UseCardDragResult {
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const [dragHoverCell, setDragHoverCell] = useState<[number, number] | null>(null);

  const ghostRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<ActiveDragInternal | null>(null);
  const justDraggedRef = useRef(false);
  const justDraggedTimerRef = useRef<number | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const cancelDrag = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = null;
    setDragSession(null);
    setDragHoverCell(null);
  }, []);

  useEffect(() => {
    if (!options.isEnabled) {
      cancelDrag();
    }
  }, [options.isEnabled, cancelDrag]);

  useLayoutEffect(() => {
    const drag = activeRef.current;
    if (dragSession && drag) {
      applyGhostTransform(ghostRef.current, drag.latestX, drag.latestHitY);
    }
  }, [dragSession?.cardUid]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePointerMove = (e: PointerEvent) => {
      const drag = activeRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;

      const opts = optionsRef.current;
      if (!opts.isEnabled) {
        activeRef.current = null;
        setDragSession(null);
        setDragHoverCell(null);
        return;
      }

      const hitY = drag.pointerType === 'touch' ? e.clientY - TOUCH_OFFSET_Y_PX : e.clientY;

      if (!drag.started) {
        const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
        if (dist < DRAG_THRESHOLD_PX) return;
        drag.started = true;
        drag.latestX = e.clientX;
        drag.latestHitY = hitY;
        opts.onDragStart?.(drag.cardUid);
      } else {
        drag.latestX = e.clientX;
        drag.latestHitY = hitY;
        applyGhostTransform(ghostRef.current, e.clientX, hitY);
      }

      const el = document.elementFromPoint(e.clientX, hitY);

      if (drag.isPermanent) {
        const overPermZone = Boolean(
          el?.closest('[data-perm-dropzone="true"]') ||
            el?.closest('[data-board-grid="true"]')
        );
        if (drag.lastOverPerm !== overPermZone || !drag.emittedSession) {
          drag.lastOverPerm = overPermZone;
          drag.emittedSession = true;
          setDragSession({
            cardUid: drag.cardUid,
            cardId: drag.cardId,
            isPermanent: true,
            overPermZone,
          });
        }
        if (drag.lastHoverKey !== null) {
          drag.lastHoverKey = null;
          setDragHoverCell(null);
        }
        return;
      }

      if (!drag.emittedSession) {
        drag.emittedSession = true;
        setDragSession({
          cardUid: drag.cardUid,
          cardId: drag.cardId,
          isPermanent: false,
          overPermZone: false,
        });
      }

      const cellEl = el?.closest('[data-board-row]') as HTMLElement | null;
      let nextCoord: [number, number] | null = null;
      if (cellEl) {
        const r = Number(cellEl.dataset.boardRow);
        const c = Number(cellEl.dataset.boardCol);
        if (Number.isInteger(r) && Number.isInteger(c) && opts.isNeutralCell(r, c)) {
          nextCoord = [r, c];
        }
      }

      const nextKey = nextCoord ? `${nextCoord[0]},${nextCoord[1]}` : null;
      if (nextKey !== drag.lastHoverKey) {
        drag.lastHoverKey = nextKey;
        if (nextCoord) {
          opts.onHoverCellChange?.();
        }
        setDragHoverCell(nextCoord);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const drag = activeRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      activeRef.current = null;

      if (drag.started) {
        justDraggedRef.current = true;
        if (justDraggedTimerRef.current !== null) {
          window.clearTimeout(justDraggedTimerRef.current);
        }
        justDraggedTimerRef.current = window.setTimeout(() => {
          justDraggedRef.current = false;
        }, 80);

        const opts = optionsRef.current;
        if (opts.isEnabled) {
          const hitY = drag.pointerType === 'touch' ? e.clientY - TOUCH_OFFSET_Y_PX : e.clientY;
          const el = document.elementFromPoint(e.clientX, hitY);

          if (drag.isPermanent) {
            if (
              el?.closest('[data-perm-dropzone="true"]') ||
              el?.closest('[data-board-grid="true"]')
            ) {
              opts.onDropPermanent(drag.cardUid);
            }
          } else {
            const cellEl = el?.closest('[data-board-row]') as HTMLElement | null;
            if (cellEl) {
              const r = Number(cellEl.dataset.boardRow);
              const c = Number(cellEl.dataset.boardCol);
              if (Number.isInteger(r) && Number.isInteger(c) && opts.isNeutralCell(r, c)) {
                opts.onDropBoard(drag.cardUid, r, c);
              }
            }
          }
        }

        setDragSession(null);
        setDragHoverCell(null);
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('blur', cancelDrag);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', cancelDrag);
      window.removeEventListener('blur', cancelDrag);
      if (justDraggedTimerRef.current !== null) {
        window.clearTimeout(justDraggedTimerRef.current);
      }
    };
  }, [cancelDrag]);

  const startCardPointerDown = useCallback(
    (
      params: { cardUid: string; cardId: number; isPermanent: boolean },
      e: React.PointerEvent<HTMLElement>
    ) => {
      if (!optionsRef.current.isEnabled) return;
      // Multi-touch guard: ignore extra touches while a drag is already active
      if (activeRef.current !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as HTMLElement | null)?.closest('.bnd-btile__info')) return;

      activeRef.current = {
        cardUid: params.cardUid,
        cardId: params.cardId,
        isPermanent: params.isPermanent,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        latestX: e.clientX,
        latestHitY: e.pointerType === 'touch' ? e.clientY - TOUCH_OFFSET_Y_PX : e.clientY,
        started: false,
        emittedSession: false,
        lastHoverKey: null,
        lastOverPerm: false,
      };
    },
    []
  );

  const wasJustDragged = useCallback(() => justDraggedRef.current, []);

  return {
    dragSession,
    dragHoverCell,
    ghostRef,
    startCardPointerDown,
    wasJustDragged,
    cancelDrag,
  };
}
