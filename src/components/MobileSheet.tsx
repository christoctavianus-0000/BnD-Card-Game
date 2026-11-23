import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useBackHandler } from '../native/backButton';
import type { BndCard, FootprintPattern, FootprintState } from '../types/bnd';
import { CardView, FootprintMiniGrid } from './CardView';

export interface MobileSheetProps {
  open: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  backPriority?: number;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

interface SheetSwipeState {
  pointerId: number;
  startY: number;
  startTime: number;
  lastOffset: number;
  dragging: boolean;
}

/**
 * Reusable mobile bottom sheet (and centered dialog in short landscape viewports)
 * with Android hardware back-button support, Escape dismissal, and swipe-to-dismiss.
 */
export const MobileSheet: React.FC<MobileSheetProps> = ({
  open,
  title,
  subtitle,
  onClose,
  backPriority = 25,
  footer,
  className = '',
  children,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<SheetSwipeState | null>(null);

  useBackHandler(() => {
    if (!open) return false;
    onClose();
    return true;
  }, backPriority);

  useEffect(() => {
    swipeRef.current = null;
    if (sheetRef.current) {
      sheetRef.current.style.transform = '';
      sheetRef.current.style.transition = '';
    }
    if (backdropRef.current) {
      backdropRef.current.style.opacity = '';
      backdropRef.current.style.transition = '';
    }
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement | null)?.closest('.bnd-sheet__close')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (swipeRef.current !== null) return;

    swipeRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startTime: Date.now(),
      lastOffset: 0,
      dragging: false,
    };
  };

  const handleDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || e.pointerId !== swipe.pointerId) return;

    const dy = e.clientY - swipe.startY;
    if (!swipe.dragging) {
      if (Math.abs(dy) < 6) return;
      swipe.dragging = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture is unavailable
      }
      if (sheetRef.current) sheetRef.current.style.transition = 'none';
      if (backdropRef.current) backdropRef.current.style.transition = 'none';
    }

    const offset = dy < 0 ? Math.max(-24, dy * 0.18) : dy;
    swipe.lastOffset = offset;

    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${offset}px)`;
    }
    if (backdropRef.current) {
      const progress = Math.min(1, Math.max(0, offset / 280));
      backdropRef.current.style.opacity = String(1 - progress * 0.65);
    }
  };

  const finishSwipe = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const swipe = swipeRef.current;
    if (!swipe || e.pointerId !== swipe.pointerId) return;
    swipeRef.current = null;

    if (!swipe.dragging) return;

    const elapsed = Math.max(1, Date.now() - swipe.startTime);
    const velocity = Math.max(0, swipe.lastOffset) / elapsed;
    const shouldDismiss =
      !cancelled &&
      (swipe.lastOffset >= 90 || (swipe.lastOffset > 24 && velocity > 0.11));

    if (shouldDismiss) {
      onClose();
      return;
    }

    if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 220ms var(--ease-out)';
      sheetRef.current.style.transform = 'translateY(0)';
    }
    if (backdropRef.current) {
      backdropRef.current.style.transition = 'opacity 220ms var(--ease-out)';
      backdropRef.current.style.opacity = '';
    }
  };

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="bnd-sheet-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={sheetRef}
        className={`bnd-sheet ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="bnd-sheet__drag-zone"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={(e) => finishSwipe(e, false)}
          onPointerCancel={(e) => finishSwipe(e, true)}
        >
          <div className="bnd-sheet__handle" aria-hidden="true" />

          <div className="bnd-sheet__header">
            <div className="bnd-sheet__titles">
              <h2 className="bnd-sheet__title">{title}</h2>
              {subtitle && <div className="bnd-sheet__subtitle">{subtitle}</div>}
            </div>
            <button
              type="button"
              className="bnd-icon-btn bnd-sheet__close"
              onClick={onClose}
              aria-label="Close panel"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="bnd-sheet__body">{children}</div>

        {footer && <div className="bnd-sheet__footer">{footer}</div>}
      </div>
    </div>
  );
};

export interface CardInspectorBodyProps {
  card: BndCard;
  effectiveState?: FootprintState;
  effectivePattern?: FootprintPattern | null;
  ownedCount?: number;
  isLost?: boolean;
  showSourceHint?: boolean;
  lockReason?: string | null;
}

/**
 * Full card inspection view displaying card artwork, JP name, ability text,
 * optional live match state, and Normal / Strengthened / Weakened 4x4 footprints.
 */
export const CardInspectorBody: React.FC<CardInspectorBodyProps> = ({
  card,
  effectiveState = 'normal',
  effectivePattern,
  ownedCount,
  isLost = false,
  showSourceHint = true,
  lockReason = null,
}) => {
  const categoryLabel =
    card.category === 'Monster'
      ? `Monster • ${card.tribe}`
      : `${card.category} (${
          card.placementType === 'permanent' ? '0-Sq Permanent' : 'Board-Placed'
        })`;

  const fullEffectText =
    card.category === 'Monster'
      ? card.traitText ?? 'Standard Monster — claims Neutral squares and Neutralizes enemies.'
      : `${card.abilityFamily}: ${card.abilityText}`;

  return (
    <div className="bnd-inspector-body">
      <div className="bnd-inspector-body__card-wrap">
        <CardView
          card={card}
          effectiveState={effectiveState}
          effectivePattern={effectivePattern}
          ownedCount={ownedCount}
          isLost={isLost}
          lockedReason={lockReason}
        />
      </div>

      {effectiveState !== 'normal' && (
        <div
          className={`bnd-inspector-state-banner ${
            effectiveState === 'reinforced' ? 'is-up' : 'is-down'
          }`}
        >
          {effectiveState === 'reinforced'
            ? '▲ Currently Strengthened in this match'
            : '▼ Currently Weakened in this match'}
        </div>
      )}

      {lockReason && (
        <div className="bnd-inspector-state-banner is-locked">🔒 {lockReason}</div>
      )}

      <div className="bnd-detail-meta">
        <div>
          <span>Japanese Title</span>
          <strong>{card.jpName}</strong>
        </div>
        <div>
          <span>Category</span>
          <strong>{categoryLabel}</strong>
        </div>
        {showSourceHint && (
          <div>
            <span>In-Game Source</span>
            <strong>{card.sourceHint}</strong>
          </div>
        )}
      </div>

      <div className="bnd-inspector-effect">
        <div className="bnd-section-label">
          {card.category === 'Monster' ? 'Trait & Behavior' : 'Ability Effect'}
        </div>
        <p>{fullEffectText}</p>
      </div>

      <div className="bnd-tri-states">
        <div>
          <span>Normal ({card.normal?.secondaries.length ?? 0})</span>
          <FootprintMiniGrid pattern={card.normal} state="normal" size="lg" />
        </div>
        <div>
          <span>Strengthened ({card.reinforced?.secondaries.length ?? 0})</span>
          <FootprintMiniGrid pattern={card.reinforced} state="reinforced" size="lg" />
        </div>
        <div>
          <span>Weakened ({card.weakened?.secondaries.length ?? 0})</span>
          <FootprintMiniGrid pattern={card.weakened} state="weakened" size="lg" />
        </div>
      </div>
    </div>
  );
};

export interface CardInspectorSheetProps extends Omit<CardInspectorBodyProps, 'card'> {
  card: BndCard | null;
  open: boolean;
  onClose: () => void;
  footer?: React.ReactNode;
  backPriority?: number;
}

export const CardInspectorSheet: React.FC<CardInspectorSheetProps> = ({
  card,
  open,
  onClose,
  footer,
  backPriority = 26,
  ...bodyProps
}) => {
  if (!card) return null;

  return (
    <MobileSheet
      open={open}
      onClose={onClose}
      backPriority={backPriority}
      title={`#${card.code} ${card.name}`}
      subtitle={
        card.category === 'Monster'
          ? `${card.tribe} Monster`
          : `${card.category} • ${card.abilityFamily}`
      }
      footer={footer}
    >
      <CardInspectorBody card={card} {...bodyProps} />
    </MobileSheet>
  );
};
