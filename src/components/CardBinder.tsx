import React, { useMemo, useState } from 'react';
import { Award, Coins, Search, Unlock } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { ALL_CARDS, getCardById } from '../data/cards';
import {
  getCardPurchaseCost,
  isBinderComplete,
  type ExtendedPlayerProfile,
} from '../state/profileStore';
import type { CardCategory, MonsterTribe } from '../types/bnd';
import { CardView, FootprintMiniGrid } from './CardView';

export interface CardBinderProps {
  profile: ExtendedPlayerProfile;
  onBuyCard: (cardId: number, cost: number) => void;
  onToggleSandbox: () => void;
}

const TRIBES: readonly MonsterTribe[] = [
  'Humanoid',
  'Beast',
  'Insect',
  'Aquatic',
  'Plant',
  'Demon',
  'Undead',
  'Spirit',
];

export const CardBinder: React.FC<CardBinderProps> = ({
  profile,
  onBuyCard,
  onToggleSandbox,
}) => {
  const [selectedId, setSelectedId] = useState<number>(1);
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'owned' | 'missing' | 'lost'>('all');
  const [catFilter, setCatFilter] = useState<'All' | CardCategory>('All');
  const [tribeFilter, setTribeFilter] = useState<'All' | MonsterTribe>('All');
  const [search, setSearch] = useState('');

  const collectedCount = profile.sandboxUnlockAll ? 105 : profile.everCollected.length;
  const complete = isBinderComplete(profile);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ALL_CARDS.filter((card) => {
      const owned = profile.sandboxUnlockAll ? Math.max(1, profile.ownedCounts[card.id] ?? 0) : (profile.ownedCounts[card.id] ?? 0);
      const isLost = profile.lostCards.includes(card.id) && owned === 0;

      if (ownershipFilter === 'owned' && owned <= 0) return false;
      if (ownershipFilter === 'missing' && (owned > 0 || profile.everCollected.includes(card.id))) return false;
      if (ownershipFilter === 'lost' && !isLost) return false;

      if (catFilter !== 'All' && card.category !== catFilter) return false;
      if (tribeFilter !== 'All') {
        if (card.category !== 'Monster' || card.tribe !== tribeFilter) return false;
      }

      if (q) {
        const hay = `${card.code} ${card.name} ${card.jpName} ${
          card.category === 'Monster' ? card.tribe : `${card.abilityFamily} ${card.abilityText}`
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [profile, ownershipFilter, catFilter, tribeFilter, search]);

  const selectedCard = getCardById(selectedId);
  const purchaseInfo = getCardPurchaseCost(profile, selectedId);
  const realOwned = profile.ownedCounts[selectedId] ?? 0;
  const isLostCard = profile.lostCards.includes(selectedId) && realOwned === 0;

  return (
    <div className="bnd-binder">
      {/* Top Binder Progress & Sandbox Switch */}
      <div className="bnd-binder__hero">
        <div className="bnd-binder__progress">
          <div className="bnd-binder__title-row">
            <Award size={22} />
            <h2>Card Binder — {collectedCount} / 105 Collected</h2>
            {complete && (
              <span className="bnd-complete-badge">
                ★ Card Sharp’s Case Unlocked (Freelancer #105 Strengthened!)
              </span>
            )}
          </div>
          <div className="bnd-progress-track">
            <div
              className="bnd-progress-fill"
              style={{ width: `${(collectedCount / 105) * 100}%` }}
            />
          </div>
        </div>

        <div className="bnd-binder__controls">
          <div className="bnd-points-pill">
            <Coins size={16} /> <strong>{profile.points} Pt</strong>
          </div>
          <button
            type="button"
            className={`bnd-btn ${profile.sandboxUnlockAll ? 'bnd-btn--gold' : 'bnd-btn--ghost'}`}
            onClick={() => {
              soundEngine.playCharacterAura();
              onToggleSandbox();
            }}
          >
            <Unlock size={16} />
            {profile.sandboxUnlockAll ? 'Sandbox: All 105 Unlocked (ON)' : 'Unlock All 105 (Sandbox Mode)'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bnd-filters">
        <div className="bnd-search">
          <Search size={15} />
          <input
            type="text"
            placeholder="Filter all 105 cards by #001–#105, English/JP name, tribe, or ability..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="bnd-filter-pills">
          {([
            ['all', 'All (105)'],
            ['owned', 'Owned'],
            ['missing', 'Uncollected'],
            ['lost', `Lost (${profile.lostCards.length})`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`bnd-pill-btn ${ownershipFilter === key ? 'is-on' : ''}`}
              onClick={() => setOwnershipFilter(key)}
            >
              {label}
            </button>
          ))}
          <span className="bnd-divider-dot">•</span>
          {(['All', 'Monster', 'Job', 'Character'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              className={`bnd-pill-btn ${catFilter === cat ? 'is-on' : ''}`}
              onClick={() => {
                setCatFilter(cat);
                if (cat !== 'Monster' && cat !== 'All') setTribeFilter('All');
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {(catFilter === 'All' || catFilter === 'Monster') && (
          <div className="bnd-filter-pills">
            <button
              type="button"
              className={`bnd-pill-btn ${tribeFilter === 'All' ? 'is-on' : ''}`}
              onClick={() => setTribeFilter('All')}
            >
              All Tribes
            </button>
            {TRIBES.map((t) => (
              <button
                key={t}
                type="button"
                className={`bnd-pill-btn ${tribeFilter === t ? 'is-on' : ''}`}
                onClick={() => setTribeFilter(t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Binder Grid + Detailed Inspector */}
      <div className="bnd-binder__content">
        <div className="bnd-binder-grid">
          {filteredCards.map((card) => {
            const count = profile.sandboxUnlockAll
              ? Math.max(1, profile.ownedCounts[card.id] ?? 0)
              : profile.ownedCounts[card.id] ?? 0;
            const lost = profile.lostCards.includes(card.id) && (profile.ownedCounts[card.id] ?? 0) === 0;
            return (
              <div
                key={card.id}
                className={`bnd-binder-cell ${count === 0 ? 'is-unowned' : ''}`}
              >
                <CardView
                  card={card}
                  compact
                  selected={selectedId === card.id}
                  ownedCount={count}
                  isLost={lost}
                  onClick={() => {
                    soundEngine.playHover();
                    setSelectedId(card.id);
                  }}
                />
              </div>
            );
          })}
        </div>

        <aside className="bnd-binder-detail">
          <div className="bnd-section-label">Binder Entry #{selectedCard.code}</div>
          <CardView
            card={selectedCard}
            ownedCount={
              profile.sandboxUnlockAll
                ? Math.max(1, realOwned)
                : realOwned
            }
            isLost={isLostCard}
          />

          <div className="bnd-detail-meta">
            <div>
              <span>Japanese Title</span>
              <strong>{selectedCard.jpName}</strong>
            </div>
            <div>
              <span>Category</span>
              <strong>
                {selectedCard.category === 'Monster'
                  ? `Monster • ${selectedCard.tribe}`
                  : `${selectedCard.category} (${selectedCard.placementType === 'permanent' ? '0-Sq Permanent' : 'Board-Placed'})`}
              </strong>
            </div>
            <div>
              <span>In-Game Source</span>
              <strong>{selectedCard.sourceHint}</strong>
            </div>
          </div>

          <div className="bnd-tri-states">
            <div>
              <span>Normal ({selectedCard.normal?.secondaries.length ?? 0})</span>
              <FootprintMiniGrid pattern={selectedCard.normal} state="normal" size="lg" />
            </div>
            <div>
              <span>Strengthened ({selectedCard.reinforced?.secondaries.length ?? 0})</span>
              <FootprintMiniGrid
                pattern={selectedCard.reinforced}
                state="reinforced"
                size="lg"
              />
            </div>
            <div>
              <span>Weakened ({selectedCard.weakened?.secondaries.length ?? 0})</span>
              <FootprintMiniGrid
                pattern={selectedCard.weakened}
                state="weakened"
                size="lg"
              />
            </div>
          </div>

          <button
            type="button"
            className="bnd-btn bnd-btn--gold bnd-btn--full"
            disabled={profile.points < purchaseInfo.cost}
            onClick={() => {
              soundEngine.playCharacterAura();
              onBuyCard(selectedCard.id, purchaseInfo.cost);
            }}
          >
            {purchaseInfo.mode === 'reacquire'
              ? `Re-Acquire Lost Card (${purchaseInfo.cost} Pt)`
              : purchaseInfo.mode === 'first'
              ? `Unlock in Point Shop (${purchaseInfo.cost} Pt)`
              : `Buy Extra Copy (${purchaseInfo.cost} Pt)`}
          </button>
        </aside>
      </div>
    </div>
  );
};
