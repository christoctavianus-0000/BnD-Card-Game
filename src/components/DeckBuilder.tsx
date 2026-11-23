import React, { useEffect, useMemo, useState } from 'react';
import { Check, Edit3, Info, Search, Sparkles, X } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { ALL_CARDS, MONSTER_TRIBES, getCardById, getCardImageUrl } from '../data/cards';
import { useViewportMode } from '../hooks/useViewportMode';
import {
  getEffectiveOwnedCount,
  type ExtendedPlayerProfile,
} from '../state/profileStore';
import type { CardCategory, MonsterTribe } from '../types/bnd';
import { CardView, FootprintMiniGrid } from './CardView';
import { CardInspectorSheet } from './MobileSheet';

export interface DeckBuilderProps {
  profile: ExtendedPlayerProfile;
  onUpdateDeck: (deckId: string, name: string, cards: number[]) => void;
  onSelectActiveDeck: (deckId: string) => void;
}

export const DeckBuilder: React.FC<DeckBuilderProps> = ({
  profile,
  onUpdateDeck,
  onSelectActiveDeck,
}) => {
  const { isMobile } = useViewportMode();
  const [editingDeckId, setEditingDeckId] = useState<string>(profile.activeDeckId);
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number>(0);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<'All' | CardCategory>('All');
  const [tribeFilter, setTribeFilter] = useState<'All' | MonsterTribe>('All');
  const [inspectedId, setInspectedId] = useState<number>(1);
  const [showInspectorSheet, setShowInspectorSheet] = useState(false);
  const [showSynergyDetail, setShowSynergyDetail] = useState(false);

  const currentDeck = useMemo(
    () => profile.decks.find((d) => d.id === editingDeckId) ?? profile.decks[0],
    [profile.decks, editingDeckId]
  );

  const [deckNameInput, setDeckNameInput] = useState(currentDeck.name);

  useEffect(() => {
    setDeckNameInput(currentDeck.name);
  }, [currentDeck.id, currentDeck.name]);

  const handleSelectDeckTab = (id: string) => {
    soundEngine.playHover();
    setEditingDeckId(id);
    const found = profile.decks.find((d) => d.id === id);
    if (found) setDeckNameInput(found.name);
    setSelectedSlotIdx(0);
  };

  const deckUsageCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const cid of currentDeck.cards) {
      counts[cid] = (counts[cid] ?? 0) + 1;
    }
    return counts;
  }, [currentDeck.cards]);

  const filteredCollection = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ALL_CARDS.filter((card) => {
      const owned = getEffectiveOwnedCount(profile, card.id);
      if (owned <= 0) return false;
      if (catFilter !== 'All' && card.category !== catFilter) return false;
      if (tribeFilter !== 'All') {
        if (card.category !== 'Monster' || card.tribe !== tribeFilter) return false;
      }
      if (q) {
        const hay = `${card.code} ${card.name} ${card.jpName} ${
          card.category === 'Monster' ? card.tribe : card.abilityFamily
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [profile, catFilter, tribeFilter, search]);

  const handleAssignCardToSlot = (cardId: number) => {
    const owned = getEffectiveOwnedCount(profile, cardId);
    const currentCardAtSlot = currentDeck.cards[selectedSlotIdx];
    const usedElsewhere =
      (deckUsageCounts[cardId] ?? 0) - (currentCardAtSlot === cardId ? 1 : 0);

    if (usedElsewhere >= owned) {
      return;
    }

    soundEngine.playSelectCard();
    const nextCards = [...currentDeck.cards];
    nextCards[selectedSlotIdx] = cardId;
    onUpdateDeck(currentDeck.id, currentDeck.name, nextCards);
    setInspectedId(cardId);
    // Advance slot cursor for rapid building
    setSelectedSlotIdx((prev) => (prev + 1) % 6);
  };

  const synergyNotes = useMemo(() => {
    const cards = currentDeck.cards.map(getCardById);
    const notes: string[] = [];
    const permCount = cards.filter(
      (c) => c.category !== 'Monster' && c.placementType === 'permanent'
    ).length;

    if (permCount > 1) {
      notes.push(
        `⚠️ Contains ${permCount} Permanent (0-Sq) Character cards — only 1 Global Permanent slot exists, and playing them claims 0 tiles!`
      );
    }

    const ids = new Set(currentDeck.cards);
    const tribes = cards
      .filter((c) => c.category === 'Monster')
      .map((c) => c.tribe);

    if (ids.has(60) && tribes.some((t) => t === 'Humanoid' || t === 'Spirit')) {
      notes.push('✨ Synergy: Shirley strengthens your Humanoid & Spirit monsters!');
    }
    if (ids.has(59) && tribes.some((t) => t === 'Beast' || t === 'Insect')) {
      notes.push('✨ Synergy: Beastmaster strengthens your Beast & Insect monsters!');
    }
    if (ids.has(63) && (ids.has(51) || ids.has(44))) {
      notes.push('🔥 Reverse-Weaken Combo: Anihal unlocks 5-Secondary Sleipnir / Asmodeus!');
    }
    if (
      ids.has(67) &&
      (tribes.some((t) => t === 'Plant' || t === 'Aquatic') ||
        cards.some(
          (c) =>
            c.category === 'Character' && c.placementType === 'placed' && c.id !== 74
        ))
    ) {
      notes.push('✨ Synergy: Prince Castor strengthens Plant, Aquatic & Placed Character cards!');
    }
    if (ids.has(67) && ids.has(74)) {
      notes.push(
        '⚠️ Anti-Synergy: Prince Castor strengthens Characters, which reduces Horten to 0 secondary squares!'
      );
    }
    if (ids.has(68) && cards.filter((c) => c.category === 'Job').length >= 2) {
      notes.push('✨ Synergy: Helio strengthens all your Asterisk Job cards!');
    }

    if (notes.length === 0) {
      notes.push('Balanced 6-card lineup ready for the tavern table.');
    }
    return notes;
  }, [currentDeck.cards]);

  const inspectedCard = getCardById(inspectedId);
  const selectedSlotCard = getCardById(currentDeck.cards[selectedSlotIdx]);
  const inspectedOwned = getEffectiveOwnedCount(profile, inspectedId);
  const inspectedInDeck = deckUsageCounts[inspectedId] ?? 0;
  const inspectedExhausted =
    inspectedInDeck - (currentDeck.cards[selectedSlotIdx] === inspectedId ? 1 : 0) >=
    inspectedOwned;

  return (
    <div className={`bnd-deckbuilder ${isMobile ? 'is-mobile' : ''}`}>
      {/* Deck Slot Selector Bar */}
      <div className={`bnd-deck-tabs ${isMobile ? 'is-scroll-row' : ''}`}>
        {profile.decks.map((d) => {
          const isEditing = d.id === currentDeck.id;
          const isEquipped = d.id === profile.activeDeckId;
          return (
            <button
              key={d.id}
              type="button"
              className={`bnd-deck-tab ${isEditing ? 'is-editing' : ''}`}
              onClick={() => handleSelectDeckTab(d.id)}
            >
              <span>{d.name}</span>
              {isEquipped && <small className="bnd-equipped-pill">EQUIPPED</small>}
            </button>
          );
        })}
      </div>

      {isMobile ? (
        <>
          {/* Mobile Rename & Equip Strip */}
          <div className="bnd-m-deck-controls">
            <div className="bnd-deck-rename">
              <Edit3 size={14} />
              <input
                type="text"
                value={deckNameInput}
                maxLength={24}
                enterKeyHint="done"
                onChange={(e) => setDeckNameInput(e.target.value)}
                onBlur={() => {
                  const clean = deckNameInput.trim() || 'Custom Deck';
                  setDeckNameInput(clean);
                  onUpdateDeck(currentDeck.id, clean, currentDeck.cards);
                }}
                aria-label="Deck Name"
              />
            </div>

            <button
              type="button"
              className={`bnd-btn bnd-btn--sm ${
                currentDeck.id === profile.activeDeckId ? 'bnd-btn--ghost' : 'bnd-btn--gold'
              }`}
              onClick={() => {
                soundEngine.playCharacterAura();
                onSelectActiveDeck(currentDeck.id);
              }}
            >
              <Check size={14} />
              {currentDeck.id === profile.activeDeckId ? 'Equipped' : 'Equip Deck'}
            </button>
          </div>

          {/* Sticky 6-Slot Mini Deck Dock */}
          <section className="bnd-m-deck-dock" aria-label="Deck Slots">
            <div className="bnd-m-deck-dock__slots">
              {currentDeck.cards.map((cid, idx) => {
                const card = getCardById(cid);
                const activeSlot = idx === selectedSlotIdx;
                return (
                  <button
                    key={`${idx}_${cid}`}
                    type="button"
                    className={`bnd-m-slot ${activeSlot ? 'is-target' : ''}`}
                    onClick={() => {
                      soundEngine.playHover();
                      setSelectedSlotIdx(idx);
                      setInspectedId(cid);
                    }}
                    aria-label={`Slot ${idx + 1}: #${card.code} ${card.name}`}
                  >
                    <img
                      src={getCardImageUrl(card.id)}
                      alt={card.name}
                      draggable={false}
                    />
                    <span className="bnd-m-slot__num">{idx + 1}</span>
                    <span className="bnd-m-slot__code">#{card.code}</span>
                  </button>
                );
              })}
            </div>

            <div className="bnd-m-deck-dock__bar">
              <div className="bnd-m-deck-dock__info">
                <span className="bnd-m-deck-dock__slotname">
                  Slot {selectedSlotIdx + 1}:{' '}
                  <strong>
                    #{selectedSlotCard.code} {selectedSlotCard.name}
                  </strong>
                </span>
              </div>
              <div className="bnd-m-deck-dock__actions">
                <button
                  type="button"
                  className={`bnd-pill-btn bnd-m-synergy-btn ${
                    showSynergyDetail ? 'is-on' : ''
                  }`}
                  onClick={() => setShowSynergyDetail((v) => !v)}
                >
                  <Sparkles size={12} />
                  {synergyNotes.length}
                </button>
                <button
                  type="button"
                  className="bnd-btn bnd-btn--ghost bnd-btn--sm"
                  onClick={() => {
                    soundEngine.playHover();
                    setInspectedId(selectedSlotCard.id);
                    setShowInspectorSheet(true);
                  }}
                >
                  <Info size={13} /> Inspect
                </button>
              </div>
            </div>

            {showSynergyDetail && (
              <div className="bnd-m-synergy-list">
                {synergyNotes.map((n, i) => (
                  <div key={i}>{n}</div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        /* Desktop 6-Card Deck Tray */
        <section className="bnd-deck-stage">
          <div className="bnd-deck-stage__header">
            <div className="bnd-deck-rename">
              <Edit3 size={15} />
              <input
                type="text"
                value={deckNameInput}
                maxLength={24}
                enterKeyHint="done"
                onChange={(e) => setDeckNameInput(e.target.value)}
                onBlur={() => {
                  const clean = deckNameInput.trim() || 'Custom Deck';
                  setDeckNameInput(clean);
                  onUpdateDeck(currentDeck.id, clean, currentDeck.cards);
                }}
                aria-label="Deck Name"
              />
            </div>

            <button
              type="button"
              className={`bnd-btn ${
                currentDeck.id === profile.activeDeckId ? 'bnd-btn--ghost' : 'bnd-btn--gold'
              }`}
              onClick={() => {
                soundEngine.playCharacterAura();
                onSelectActiveDeck(currentDeck.id);
              }}
            >
              <Check size={16} />
              {currentDeck.id === profile.activeDeckId
                ? 'Active Match Deck'
                : 'Set as Active Match Deck'}
            </button>
          </div>

          <p className="bnd-hint-line">
            Select a slot (1–6) below, then click any owned card in your collection to swap it in.
          </p>

          <div className="bnd-deck-slots">
            {currentDeck.cards.map((cid, idx) => {
              const card = getCardById(cid);
              const activeSlot = idx === selectedSlotIdx;
              return (
                <div
                  key={`${idx}_${cid}`}
                  className={`bnd-deck-slot ${activeSlot ? 'is-target-slot' : ''}`}
                >
                  <div className="bnd-deck-slot__num">Slot {idx + 1}</div>
                  <CardView
                    card={card}
                    selected={activeSlot}
                    onClick={() => {
                      soundEngine.playHover();
                      setSelectedSlotIdx(idx);
                      setInspectedId(cid);
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div className="bnd-synergy-bar">
            <Sparkles size={16} />
            <div>
              {synergyNotes.map((n, i) => (
                <div key={i}>{n}</div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Bottom Split: Collection Picker + 3-State Footprint Inspector */}
      <div className="bnd-builder-lower">
        <div className="bnd-collection-panel">
          <div className="bnd-filters">
            <div className="bnd-search">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search owned cards by name, #code, tribe, or ability..."
                enterKeyHint="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search.length > 0 && (
                <button
                  type="button"
                  className="bnd-search__clear"
                  aria-label="Clear card search"
                  onClick={() => setSearch('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className={`bnd-filter-pills ${isMobile ? 'is-scroll-row' : ''}`}>
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
              <div className={`bnd-filter-pills ${isMobile ? 'is-scroll-row' : ''}`}>
                <button
                  type="button"
                  className={`bnd-pill-btn ${tribeFilter === 'All' ? 'is-on' : ''}`}
                  onClick={() => setTribeFilter('All')}
                >
                  All Tribes
                </button>
                {MONSTER_TRIBES.map((t) => (
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

          {filteredCollection.length === 0 ? (
            <div className="bnd-empty-state">
              <p>No owned cards match your current filters.</p>
              <button
                type="button"
                className="bnd-btn bnd-btn--ghost bnd-btn--sm"
                onClick={() => {
                  setSearch('');
                  setCatFilter('All');
                  setTribeFilter('All');
                }}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="bnd-collection-grid">
              {filteredCollection.map((card) => {
                const owned = getEffectiveOwnedCount(profile, card.id);
                const inDeck = deckUsageCounts[card.id] ?? 0;
                const currentSlotCard = currentDeck.cards[selectedSlotIdx];
                const exhausted =
                  inDeck - (currentSlotCard === card.id ? 1 : 0) >= owned;

                return (
                  <div key={card.id} className="bnd-collection-cell">
                    <CardView
                      card={card}
                      compact
                      ownedCount={owned - inDeck}
                      lockedReason={
                        exhausted ? 'All owned copies already in this deck' : null
                      }
                      onInspect={
                        isMobile
                          ? () => {
                              soundEngine.playHover();
                              setInspectedId(card.id);
                              setShowInspectorSheet(true);
                            }
                          : undefined
                      }
                      onClick={() => {
                        setInspectedId(card.id);
                        if (!exhausted) {
                          handleAssignCardToSlot(card.id);
                        } else if (isMobile) {
                          setShowInspectorSheet(true);
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop Side Card State Inspector */}
        {!isMobile && (
          <aside className="bnd-inspector-card">
            <div className="bnd-section-label">Card Footprint Inspector</div>
            <h3>
              #{inspectedCard.code} {inspectedCard.name}{' '}
              <small>({inspectedCard.jpName})</small>
            </h3>
            <p className="bnd-inspector-desc">
              {inspectedCard.category === 'Monster'
                ? `${inspectedCard.tribe} Monster${inspectedCard.traitText ? ` • ${inspectedCard.traitText}` : ''}`
                : `${inspectedCard.category} (${inspectedCard.abilityFamily}) — ${inspectedCard.abilityText}`}
            </p>

            <div className="bnd-tri-states">
              <div>
                <span>Normal</span>
                <FootprintMiniGrid pattern={inspectedCard.normal} state="normal" size="lg" />
              </div>
              <div>
                <span>Strengthened</span>
                <FootprintMiniGrid
                  pattern={inspectedCard.reinforced}
                  state="reinforced"
                  size="lg"
                />
              </div>
              <div>
                <span>Weakened</span>
                <FootprintMiniGrid
                  pattern={inspectedCard.weakened}
                  state="weakened"
                  size="lg"
                />
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Mobile Footprint Inspector Sheet */}
      {isMobile && (
        <CardInspectorSheet
          open={showInspectorSheet}
          card={inspectedCard}
          ownedCount={inspectedOwned - inspectedInDeck}
          lockReason={
            inspectedExhausted ? 'All owned copies are already in this deck' : null
          }
          onClose={() => setShowInspectorSheet(false)}
          backPriority={15}
          footer={
            <button
              type="button"
              className="bnd-btn bnd-btn--gold bnd-btn--full"
              disabled={inspectedExhausted}
              onClick={() => {
                handleAssignCardToSlot(inspectedCard.id);
                setShowInspectorSheet(false);
              }}
            >
              {inspectedExhausted
                ? 'All Owned Copies Used'
                : `Assign to Slot ${selectedSlotIdx + 1}`}
            </button>
          }
        />
      )}
    </div>
  );
};
