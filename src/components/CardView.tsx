import React from 'react';
import { getCardImageUrl } from '../data/cards/cardImages';
import type { BndCard, FootprintPattern, FootprintState, MonsterTribe } from '../types/bnd';

interface ThemePalette {
  border: string;
  accent: string;
}

const TRIBE_PALETTES: Record<MonsterTribe, ThemePalette> = {
  Humanoid: { border: '#d97706', accent: '#fbbf24' },
  Beast: { border: '#ea580c', accent: '#fb923c' },
  Insect: { border: '#84cc16', accent: '#bef264' },
  Aquatic: { border: '#0ea5e9', accent: '#7dd3fc' },
  Plant: { border: '#10b981', accent: '#6ee7b7' },
  Demon: { border: '#e11d48', accent: '#fda4af' },
  Undead: { border: '#8b5cf6', accent: '#c4b5fd' },
  Spirit: { border: '#06b6d4', accent: '#a5f3fc' },
};

const JOB_PALETTE: ThemePalette = { border: '#eab308', accent: '#fde047' };
const CHAR_PLACED_PALETTE: ThemePalette = { border: '#c084fc', accent: '#e9d5ff' };
const CHAR_PERM_PALETTE: ThemePalette = { border: '#f59e0b', accent: '#fef08a' };

export function getCardPalette(card: BndCard): ThemePalette {
  if (card.category === 'Monster') {
    return TRIBE_PALETTES[card.tribe];
  }
  if (card.category === 'Job') {
    return JOB_PALETTE;
  }
  return card.placementType === 'permanent' ? CHAR_PERM_PALETTE : CHAR_PLACED_PALETTE;
}

export interface FootprintMiniGridProps {
  pattern: FootprintPattern | null;
  state?: FootprintState;
  size?: 'sm' | 'md' | 'lg' | 'overlay';
  rotate180?: boolean;
}

export const FootprintMiniGrid: React.FC<FootprintMiniGridProps> = ({
  pattern,
  state = 'normal',
  size = 'md',
  rotate180 = false,
}) => {
  if (!pattern) {
    return (
      <div className={`bnd-perm-badge bnd-perm-badge--${size}`} title="0-Square Permanent Effect Card">
        <span>★</span>
        <small>PERM</small>
      </div>
    );
  }

  const [rawAr, rawAc] = pattern.anchor;
  const ar = rotate180 ? 3 - rawAr : rawAr;
  const ac = rotate180 ? 3 - rawAc : rawAc;

  const secSet = new Set<string>();
  for (const [dr, dc] of pattern.secondaries) {
    const rDr = rotate180 ? -dr : dr;
    const rDc = rotate180 ? -dc : dc;
    secSet.add(`${ar + rDr},${ac + rDc}`);
  }

  return (
    <div
      className={`bnd-minigrid bnd-minigrid--${size} bnd-minigrid--${state}`}
      title={`Primary: 1 | Secondary: ${pattern.secondaries.length} (${state})`}
    >
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3].map((c) => {
          const isPrimary = r === ar && c === ac;
          const isSec = secSet.has(`${r},${c}`);
          let cls = 'bnd-minigrid__cell';
          if (isPrimary) cls += ' is-primary';
          else if (isSec) cls += ` is-sec is-sec--${state}`;
          return <span key={`${r}_${c}`} className={cls} />;
        })
      )}
    </div>
  );
};

export interface CardViewProps {
  card: BndCard;
  effectiveState?: FootprintState;
  effectivePattern?: FootprintPattern | null;
  selected?: boolean;
  lockedReason?: string | null;
  ownedCount?: number;
  isLost?: boolean;
  compact?: boolean;
  onClick?: () => void;
}

export const CardView: React.FC<CardViewProps> = ({
  card,
  effectiveState = 'normal',
  effectivePattern,
  selected = false,
  lockedReason = null,
  ownedCount,
  isLost = false,
  compact = false,
  onClick,
}) => {
  const palette = getCardPalette(card);
  const patternToRender =
    effectivePattern !== undefined ? effectivePattern : card[effectiveState];

  const subtitle =
    card.category === 'Monster'
      ? card.tribe
      : `${
          card.category === 'Job'
            ? 'Job'
            : card.placementType === 'permanent'
            ? 'Perm. Char'
            : 'Character'
        } • ${card.abilityFamily}`;

  const desc =
    card.category === 'Monster'
      ? card.traitText ?? null
      : card.abilityText;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'bnd-card',
        compact ? 'bnd-card--compact' : '',
        selected ? 'is-selected' : '',
        lockedReason ? 'is-locked' : '',
        effectiveState === 'reinforced' ? 'is-reinforced' : '',
        effectiveState === 'weakened' ? 'is-weakened' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--card-border': palette.border,
          '--card-accent': palette.accent,
        } as React.CSSProperties
      }
      title={
        lockedReason ??
        `#${card.code} ${card.name} (${subtitle})${desc ? ` — ${desc}` : ''}`
      }
    >
      <div className="bnd-card__visual">
        <img
          src={getCardImageUrl(card.id)}
          alt={`#${card.code} ${card.name}`}
          className="bnd-card__img"
          loading="lazy"
          draggable={false}
        />

        {/* Dynamic live 4x4 grid overlay ONLY when Strengthened or Weakened during a match */}
        {effectiveState !== 'normal' && patternToRender && (
          <div className="bnd-card__live-grid">
            <FootprintMiniGrid
              pattern={patternToRender}
              state={effectiveState}
              size="overlay"
            />
          </div>
        )}

        {effectiveState === 'reinforced' && (
          <span className="bnd-card__state-pill is-up">▲ BUFF</span>
        )}
        {effectiveState === 'weakened' && (
          <span className="bnd-card__state-pill is-down">▼ WEAK</span>
        )}

        {ownedCount !== undefined && (
          <div className={`bnd-card__count ${ownedCount === 0 ? 'is-zero' : ''}`}>
            {isLost && ownedCount === 0 ? 'LOST' : `×${ownedCount}`}
          </div>
        )}

        {lockedReason && (
          <div className="bnd-card__lock-overlay">
            <span>🔒 Sealed</span>
          </div>
        )}
      </div>

      <div className="bnd-card__plate">
        <div className="bnd-card__title-line">
          <span className="bnd-card__code">#{card.code}</span>
          <span className="bnd-card__name">{card.name}</span>
        </div>
        <div className="bnd-card__subtitle">{subtitle}</div>
        {!compact && desc && <div className="bnd-card__desc">{desc}</div>}
      </div>
    </button>
  );
};
