import React, { useEffect, useMemo, useState } from 'react';
import { Crown, Lock, RotateCcw, ShieldAlert, Sparkles, Swords, Trophy } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { getCardById } from '../data/cards';
import { NPC_OPPONENTS } from '../data/opponents';
import {
  calculateRuleMultiplier,
  canChallengeRank,
  MATCH_RULES,
  RANK_MULTIPLIERS,
  RANK_THRESHOLDS,
} from '../engine/rules';
import {
  getEffectiveRank,
  type ExtendedPlayerProfile,
} from '../state/profileStore';
import type { MatchRuleId, NpcOpponent, OpponentRank } from '../types/bnd';
import { CardView } from './CardView';

export interface OpponentSelectProps {
  profile: ExtendedPlayerProfile;
  onSelectActiveDeck: (deckId: string) => void;
  onStartMatch: (opponent: NpcOpponent, rules: MatchRuleId[]) => void;
}

const RANKS: readonly OpponentRank[] = ['C', 'B', 'A', 'S'];

export const OpponentSelect: React.FC<OpponentSelectProps> = ({
  profile,
  onSelectActiveDeck,
  onStartMatch,
}) => {
  const [rankFilter, setRankFilter] = useState<'All' | OpponentRank>('All');
  const [selectedNpcId, setSelectedNpcId] = useState<string>(NPC_OPPONENTS[0].id);

  const playerRank = getEffectiveRank(profile);

  const filteredOpponents = useMemo(() => {
    if (rankFilter === 'All') return NPC_OPPONENTS;
    return NPC_OPPONENTS.filter((npc) => npc.rank === rankFilter);
  }, [rankFilter]);

  const selectedNpc = useMemo(
    () =>
      NPC_OPPONENTS.find((n) => n.id === selectedNpcId) ??
      filteredOpponents[0] ??
      NPC_OPPONENTS[0],
    [selectedNpcId, filteredOpponents]
  );

  const [selectedRules, setSelectedRules] = useState<MatchRuleId[]>([
    ...selectedNpc.defaultRules,
  ]);

  // Sync default rules whenever user switches NPC
  useEffect(() => {
    setSelectedRules([...selectedNpc.defaultRules]);
  }, [selectedNpc]);

  const allRewardsCollectedForNpc = useMemo(
    () =>
      selectedNpc.rewardCards.every(
        (cid) => profile.everCollected.includes(cid) || (profile.ownedCounts[cid] ?? 0) > 0
      ),
    [selectedNpc, profile.everCollected, profile.ownedCounts]
  );

  const canCustomizeRules =
    profile.sandboxUnlockAll ||
    canChallengeRank(playerRank, 'B') ||
    allRewardsCollectedForNpc;

  const isNpcUnlocked = canChallengeRank(playerRank, selectedNpc.rank);

  const toggleRule = (ruleId: MatchRuleId) => {
    if (!canCustomizeRules) return;
    soundEngine.playHover();
    setSelectedRules((prev) => {
      if (prev.includes(ruleId)) {
        return prev.filter((r) => r !== ruleId);
      }
      if (prev.length >= 2) {
        return prev;
      }
      return [...prev, ruleId];
    });
  };

  const activeDeck = useMemo(
    () => profile.decks.find((d) => d.id === profile.activeDeckId) ?? profile.decks[0],
    [profile.decks, profile.activeDeckId]
  );

  const rankMult = RANK_MULTIPLIERS[selectedNpc.rank];
  const ruleMult = calculateRuleMultiplier(selectedRules);
  const combinedMult = rankMult * ruleMult;

  const progressPct = profile.sandboxUnlockAll
    ? 100
    : Math.min(100, (profile.cumulativePoints / RANK_THRESHOLDS.S) * 100);

  return (
    <div className="bnd-tavern">
      {/* Top Rank Progression & Active Deck Quick-Bar */}
      <section className="bnd-tavern__hero">
        <div className="bnd-rank-progress">
          <div className="bnd-rank-progress__head">
            <div className="bnd-rank-progress__title">
              <Crown size={20} />
              <span>
                Duelist License: <strong>Rank {playerRank}</strong>
              </span>
              {profile.sandboxUnlockAll && (
                <span className="bnd-chip bnd-chip--gold">Sandbox Unlocked</span>
              )}
            </div>
            <span className="bnd-rank-progress__pts">
              Cumulative Earned: <strong>{profile.cumulativePoints} Pt</strong>
            </span>
          </div>

          <div className="bnd-progress-track">
            <div className="bnd-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="bnd-rank-milestones">
            {RANKS.map((rk) => {
              const reached = canChallengeRank(playerRank, rk);
              return (
                <span key={rk} className={reached ? 'is-reached' : ''}>
                  Rank {rk}: {RANK_THRESHOLDS[rk]} Pt {reached ? '✓' : ''}
                </span>
              );
            })}
          </div>
        </div>

        <div className="bnd-quick-deck">
          <div className="bnd-section-label">Equipped Match Deck</div>
          <div className="bnd-quick-deck__select">
            {profile.decks.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`bnd-pill-btn ${d.id === activeDeck.id ? 'is-on' : ''}`}
                onClick={() => {
                  soundEngine.playSelectCard();
                  onSelectActiveDeck(d.id);
                }}
              >
                {d.name}
              </button>
            ))}
          </div>
          <div className="bnd-quick-deck__mini">
            {activeDeck.cards.map((cid, idx) => {
              const c = getCardById(cid);
              return (
                <span key={`${idx}_${cid}`} className="bnd-mini-card-tag" title={`${c.code} ${c.name}`}>
                  #{c.code} {c.name}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {/* Rank Filter Pills */}
      <div className="bnd-filter-pills bnd-tavern__filters">
        <button
          type="button"
          className={`bnd-pill-btn ${rankFilter === 'All' ? 'is-on' : ''}`}
          onClick={() => setRankFilter('All')}
        >
          All Duelists ({NPC_OPPONENTS.length})
        </button>
        {RANKS.map((rk) => {
          const count = NPC_OPPONENTS.filter((n) => n.rank === rk).length;
          const unlocked = canChallengeRank(playerRank, rk);
          return (
            <button
              key={rk}
              type="button"
              className={`bnd-pill-btn ${rankFilter === rk ? 'is-on' : ''}`}
              onClick={() => setRankFilter(rk)}
            >
              {!unlocked && <Lock size={12} />} Rank {rk} ({count})
            </button>
          );
        })}
      </div>

      {/* Main Split: Opponent Roster (Left) + Selected Duelist Table Setup (Right) */}
      <div className="bnd-tavern__grid">
        <div className="bnd-roster-list">
          {filteredOpponents.map((npc) => {
            const unlocked = canChallengeRank(playerRank, npc.rank);
            const wins = profile.npcWins[npc.id] ?? 0;
            const collectedRewards = npc.rewardCards.filter((cid) =>
              profile.sandboxUnlockAll ? true : profile.everCollected.includes(cid)
            ).length;
            const isSelected = npc.id === selectedNpc.id;

            return (
              <button
                key={npc.id}
                type="button"
                className={[
                  'bnd-npc-row',
                  isSelected ? 'is-selected' : '',
                  !unlocked ? 'is-locked' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  soundEngine.playHover();
                  setSelectedNpcId(npc.id);
                }}
              >
                <div
                  className="bnd-npc-row__avatar"
                  style={{
                    background: npc.avatarTheme.primary,
                    borderColor: npc.avatarTheme.accent,
                  }}
                >
                  {npc.avatarTheme.emblem}
                </div>

                <div className="bnd-npc-row__info">
                  <div className="bnd-npc-row__top">
                    <strong>{npc.name}</strong>
                    <span className={`bnd-rank-tag rank-${npc.rank}`}>Rank {npc.rank}</span>
                  </div>
                  <div className="bnd-npc-row__region">
                    {npc.title} • {npc.region}
                  </div>
                  <div className="bnd-npc-row__stats">
                    <span>
                      <Trophy size={12} /> {wins} {wins === 1 ? 'Win' : 'Wins'}
                    </span>
                    <span>
                      Cards: {collectedRewards}/{npc.rewardCards.length}
                    </span>
                    {npc.deckSecond && (
                      <span className="bnd-dual-badge" title="Uses dedicated Going-First and Going-Second decks">
                        1st/2nd Decks
                      </span>
                    )}
                  </div>
                </div>

                {!unlocked && (
                  <div className="bnd-npc-row__lock" title={`Requires Rank ${npc.rank}`}>
                    <Lock size={16} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Opponent Dossier & Rule Configurator */}
        <aside className="bnd-challenger-panel">
          <div
            className="bnd-challenger-head"
            style={{ borderColor: selectedNpc.avatarTheme.accent }}
          >
            <div
              className="bnd-challenger-head__emblem"
              style={{ background: selectedNpc.avatarTheme.primary }}
            >
              {selectedNpc.avatarTheme.emblem}
            </div>
            <div className="bnd-challenger-head__text">
              <div className="bnd-challenger-head__title">
                <h2>{selectedNpc.name}</h2>
                <span className={`bnd-rank-tag rank-${selectedNpc.rank}`}>
                  Rank {selectedNpc.rank} ({rankMult.toFixed(1)}×)
                </span>
              </div>
              <div className="bnd-challenger-head__meta">
                {selectedNpc.jpName} • {selectedNpc.title} • {selectedNpc.region}
              </div>
              <blockquote className="bnd-challenger-quote">
                “{selectedNpc.quoteIntro}”
              </blockquote>
            </div>
          </div>

          {/* Match Rules Configurator */}
          <div className="bnd-rules-config">
            <div className="bnd-rules-config__head">
              <div>
                <div className="bnd-section-label">Match Rules (Select up to 2)</div>
                {!canCustomizeRules && (
                  <small className="txt-warn">
                    Reach Rank B or collect all of {selectedNpc.name}’s cards to customize rules.
                  </small>
                )}
              </div>
              {canCustomizeRules && (
                <button
                  type="button"
                  className="bnd-btn bnd-btn--ghost bnd-btn--sm"
                  onClick={() => setSelectedRules([...selectedNpc.defaultRules])}
                >
                  <RotateCcw size={13} /> Default
                </button>
              )}
            </div>

            <div className="bnd-rules-grid">
              {MATCH_RULES.map((rule) => {
                const active = selectedRules.includes(rule.id);
                const maxedOut = !active && selectedRules.length >= 2;
                return (
                  <button
                    key={rule.id}
                    type="button"
                    disabled={!canCustomizeRules || maxedOut}
                    className={`bnd-rule-card ${active ? 'is-active' : ''}`}
                    onClick={() => toggleRule(rule.id)}
                  >
                    <div className="bnd-rule-card__top">
                      <strong>{rule.name}</strong>
                      <span className="bnd-rule-mult">{rule.multiplier.toFixed(2)}×</span>
                    </div>
                    <p>{rule.description}</p>
                  </button>
                );
              })}
            </div>

            <div className="bnd-multiplier-bar">
              <Sparkles size={16} />
              <span>
                Victory Payout Rate: Rank {selectedNpc.rank} (<strong>{rankMult.toFixed(2)}×</strong>) × Rules (<strong>{ruleMult.toFixed(2)}×</strong>) ={' '}
                <strong className="txt-gold">{combinedMult.toFixed(2)}× Pt / Square</strong>
              </span>
              {!selectedRules.includes('no_keepsies') && !profile.sandboxUnlockAll && (
                <span className="bnd-keepsies-warn" title="Losing or drawing forfeits 1 random card from your match deck!">
                  <ShieldAlert size={14} /> Keepsies Active
                </span>
              )}
            </div>
          </div>

          {/* Opponent Reward Card Pool */}
          <div className="bnd-npc-rewards">
            <div className="bnd-section-label">
              Winnable Cards from {selectedNpc.name} ({selectedNpc.rewardCards.length})
            </div>
            <div className="bnd-npc-rewards__grid">
              {selectedNpc.rewardCards.map((cid) => {
                const card = getCardById(cid);
                const owned = profile.sandboxUnlockAll
                  ? Math.max(1, profile.ownedCounts[cid] ?? 0)
                  : profile.ownedCounts[cid] ?? 0;
                return (
                  <CardView
                    key={cid}
                    card={card}
                    compact
                    ownedCount={owned}
                    isLost={profile.lostCards.includes(cid) && owned === 0}
                  />
                );
              })}
            </div>
          </div>

          {/* Launch Match CTA */}
          <div className="bnd-challenger-cta">
            {isNpcUnlocked ? (
              <button
                type="button"
                className="bnd-btn bnd-btn--gold bnd-btn--lg bnd-btn--full"
                onClick={() => {
                  soundEngine.playSelectCard();
                  onStartMatch(selectedNpc, selectedRules);
                }}
              >
                <Swords size={18} /> Challenge {selectedNpc.name} (Deck: {activeDeck.name})
              </button>
            ) : (
              <button
                type="button"
                className="bnd-btn bnd-btn--ghost bnd-btn--lg bnd-btn--full"
                disabled
              >
                <Lock size={16} /> Locked — Earn {RANK_THRESHOLDS[selectedNpc.rank]} Cumulative Pt for Rank {selectedNpc.rank} (or Enable Sandbox)
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
