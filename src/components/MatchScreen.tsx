import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Shield, Skull, Sparkles, Swords, Trophy, ArrowLeft, HelpCircle } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { getCardById, getCardImageUrl } from '../data/cards';
import { chooseAiAction } from '../engine/ai';
import {
  countBoardSquares,
  createMatch,
  getCardEffectiveState,
  getCardPlayLockReason,
  hasAnyPlayableMove,
  isCardPlayable,
  passTurn,
  playCard,
  previewBoardPlacement,
} from '../engine/engine';
import {
  calculateMatchPoints,
  calculateRuleMultiplier,
  getMatchRuleDef,
  RANK_MULTIPLIERS,
} from '../engine/rules';
import {
  getCardPurchaseCost,
  type ExtendedPlayerProfile,
} from '../state/profileStore';
import type { MatchRuleId, MatchState, NpcOpponent } from '../types/bnd';
import { CardView } from './CardView';

export interface MatchScreenProps {
  opponent: NpcOpponent;
  playerDeck: number[];
  matchRules: MatchRuleId[];
  profile: ExtendedPlayerProfile;
  allBinderCollected: boolean;
  onFinishOutcome: (params: {
    earnedPoints: number;
    won: boolean;
    lostCardId?: number;
  }) => void;
  onClaimRewardCard: (cardId: number, cost: number) => void;
  onBackToTavern: () => void;
}

function triggerMoveSfx(prev: MatchState, next: MatchState): void {
  const kinds = next.highlights.map((h) => h.kind);
  const flankedCount = kinds.filter((k) => k === 'flanked').length;
  const neutCount = kinds.filter((k) => k === 'neutralized').length;
  const shieldBroken = kinds.includes('shield_broken');

  if (next.permanentCard && next.permanentCard.cardId !== prev.permanentCard?.cardId) {
    soundEngine.playCharacterAura();
    return;
  }

  soundEngine.playPlaceCard();
  if (shieldBroken) {
    soundEngine.playShieldBreak();
  }
  if (neutCount > 0) {
    soundEngine.playNeutralize(neutCount);
  }
  if (flankedCount > 0) {
    soundEngine.playFlank(flankedCount);
  }
}

export const MatchScreen: React.FC<MatchScreenProps> = ({
  opponent,
  playerDeck,
  matchRules,
  profile,
  allBinderCollected,
  onFinishOutcome,
  onClaimRewardCard,
  onBackToTavern,
}) => {
  const initMatch = () => {
    const playerFirst = Math.random() < 0.5;
    const oppDeck =
      !playerFirst && opponent.deckSecond ? opponent.deckSecond : opponent.deckFirst;
    return createMatch({
      playerDeck,
      opponentDeck: oppDeck,
      firstPlayer: playerFirst ? 'player' : 'opponent',
      matchRules,
      allBinderCollected,
    });
  };

  const [match, setMatch] = useState<MatchState>(initMatch);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [outcomeRecorded, setOutcomeRecorded] = useState(false);
  const [lostCardId, setLostCardId] = useState<number | undefined>(undefined);
  const [claimedThisMatch, setClaimedThisMatch] = useState<number[]>([]);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    soundEngine.playCoinToss();
  }, []);

  // Auto-select first playable card on player's turn
  useEffect(() => {
    if (match.status !== 'playing' || match.activeTurn !== 'player') {
      setSelectedUid(null);
      return;
    }
    const stillValid =
      selectedUid &&
      match.hands.player.some(
        (c) => c.uid === selectedUid && isCardPlayable(match, 'player', c.cardId)
      );
    if (!stillValid) {
      const firstPlayable = match.hands.player.find((c) =>
        isCardPlayable(match, 'player', c.cardId)
      );
      setSelectedUid(firstPlayable?.uid ?? null);
    }
  }, [match, selectedUid]);

  // AI turn execution
  useEffect(() => {
    if (match.status !== 'playing' || match.activeTurn !== 'opponent') return;
    const timer = window.setTimeout(() => {
      setMatch((prev) => {
        if (prev.status !== 'playing' || prev.activeTurn !== 'opponent') return prev;
        const action = chooseAiAction(prev, opponent.rank);
        const next =
          action.type === 'pass'
            ? passTurn(prev)
            : playCard(prev, {
                cardUid: action.cardUid!,
                targetRow: action.targetRow,
                targetCol: action.targetCol,
              });
        triggerMoveSfx(prev, next);
        return next;
      });
    }, 680);
    return () => window.clearTimeout(timer);
  }, [match.status, match.activeTurn, match.turnNumber, opponent.rank]);

  // Handle Match End SFX + Outcome Recording + Keepsies
  const scores = useMemo(() => countBoardSquares(match.board), [match.board]);

  const earnedPoints = useMemo(
    () =>
      calculateMatchPoints({
        outcome: match.status === 'playing' ? 'draw' : match.status,
        playerScore: scores.player,
        opponentRank: opponent.rank,
        rules: match.matchRules,
      }),
    [match.status, scores.player, opponent.rank, match.matchRules]
  );

  useEffect(() => {
    if (match.status === 'playing' || outcomeRecorded) return;
    setOutcomeRecorded(true);

    if (match.status === 'player_win') {
      soundEngine.playVictory();
      onFinishOutcome({ earnedPoints, won: true });
    } else {
      if (match.status === 'draw') soundEngine.playDraw();
      else soundEngine.playDefeat();

      const keepsiesActive =
        !match.matchRules.includes('no_keepsies') && !profile.sandboxUnlockAll;
      let chosenLost: number | undefined;
      if (keepsiesActive && playerDeck.length > 0) {
        chosenLost = playerDeck[Math.floor(Math.random() * playerDeck.length)];
        setLostCardId(chosenLost);
      }
      onFinishOutcome({ earnedPoints: 0, won: false, lostCardId: chosenLost });
    }
  }, [
    match.status,
    outcomeRecorded,
    earnedPoints,
    match.matchRules,
    profile.sandboxUnlockAll,
    playerDeck,
    onFinishOutcome,
  ]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [match.log.length]);

  const selectedCardInst = useMemo(
    () => match.hands.player.find((c) => c.uid === selectedUid) ?? null,
    [match.hands.player, selectedUid]
  );

  const selectedCard = useMemo(
    () => (selectedCardInst ? getCardById(selectedCardInst.cardId) : null),
    [selectedCardInst]
  );

  const isSelectedPermanent =
    selectedCard !== null &&
    selectedCard.category !== 'Monster' &&
    selectedCard.placementType === 'permanent';

  const preview = useMemo(() => {
    if (
      match.status !== 'playing' ||
      match.activeTurn !== 'player' ||
      !selectedCard ||
      isSelectedPermanent ||
      !hoverCell
    ) {
      return null;
    }
    return previewBoardPlacement(
      match,
      'player',
      selectedCard.id,
      hoverCell[0],
      hoverCell[1]
    );
  }, [match, selectedCard, isSelectedPermanent, hoverCell]);

  const handleBoardCellClick = (r: number, c: number) => {
    if (match.status !== 'playing' || match.activeTurn !== 'player') return;
    if (!selectedCardInst || isSelectedPermanent) return;
    if (match.board[r][c].owner !== 'neutral') return;

    const next = playCard(match, {
      cardUid: selectedCardInst.uid,
      targetRow: r,
      targetCol: c,
    });
    triggerMoveSfx(match, next);
    setHoverCell(null);
    setMatch(next);
  };

  const handleActivatePermanent = () => {
    if (match.status !== 'playing' || match.activeTurn !== 'player') return;
    if (!selectedCardInst || !isSelectedPermanent) return;
    const next = playCard(match, { cardUid: selectedCardInst.uid });
    triggerMoveSfx(match, next);
    setMatch(next);
  };

  const handlePassTurn = () => {
    if (match.status !== 'playing' || match.activeTurn !== 'player') return;
    soundEngine.playNeutralize(1);
    setMatch((prev) => passTurn(prev));
  };

  const handleRematch = () => {
    soundEngine.playCoinToss();
    setOutcomeRecorded(false);
    setLostCardId(undefined);
    setClaimedThisMatch([]);
    setHoverCell(null);
    setMatch(initMatch());
  };

  const playerHasMove = hasAnyPlayableMove(match, 'player');
  const permCardObj = match.permanentCard ? getCardById(match.permanentCard.cardId) : null;

  // Build fast lookup maps for hover preview badges
  const previewTags = useMemo(() => {
    const map = new Map<string, { label: string; cls: string }>();
    if (!preview) return map;
    const wrapSet = new Set(preview.wrappedCells.map(([r, c]) => `${r},${c}`));

    map.set(`${preview.primaryCell[0]},${preview.primaryCell[1]}`, {
      label: 'ANCHOR',
      cls: 'is-prev-primary',
    });
    for (const [r, c] of preview.claimedCells) {
      const w = wrapSet.has(`${r},${c}`) ? '🌀 ' : '';
      map.set(`${r},${c}`, { label: `${w}+CLAIM`, cls: 'is-prev-claim' });
    }
    for (const [r, c] of preview.neutralizedCells) {
      const w = wrapSet.has(`${r},${c}`) ? '🌀 ' : '';
      map.set(`${r},${c}`, {
        label: selectedCard?.id === 74 ? `${w}🛡️ TAKE` : `${w}✕ NEUT`,
        cls: 'is-prev-neut',
      });
    }
    for (const [r, c] of preview.shieldBreakCells) {
      map.set(`${r},${c}`, { label: '⚡ WARD', cls: 'is-prev-ward' });
    }
    for (const [r, c] of preview.flankedCells) {
      map.set(`${r},${c}`, { label: '↻ FLANK', cls: 'is-prev-flank' });
    }
    return map;
  }, [preview, selectedCard]);

  const highlightLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of match.highlights) {
      map.set(`${h.row},${h.col}`, h.kind);
    }
    return map;
  }, [match.highlights]);

  return (
    <div className="bnd-match">
      {/* Top Duelist & Score Bar */}
      <div className="bnd-match__topbar">
        <button type="button" className="bnd-btn bnd-btn--ghost" onClick={onBackToTavern}>
          <ArrowLeft size={16} /> Leave Table
        </button>

        <div className="bnd-scoreboard">
          <div className={`bnd-score-side is-blue ${match.activeTurn === 'player' && match.status === 'playing' ? 'is-active' : ''}`}>
            <span className="bnd-score-side__label">YOU (BLUE)</span>
            <strong className="bnd-score-side__num">{scores.player}</strong>
          </div>

          <div className="bnd-score-center">
            <span className="bnd-turn-pill">Turn {match.turnNumber}</span>
            <div className="bnd-score-bar">
              <div
                className="bnd-score-bar__blue"
                style={{ width: `${(scores.player / 25) * 100}%` }}
              />
              <div
                className="bnd-score-bar__red"
                style={{ width: `${(scores.opponent / 25) * 100}%` }}
              />
            </div>
            {match.matchRules.includes('first_past_the_post') && (
              <small className="bnd-fptp-note">Goal: 15 Squares</small>
            )}
          </div>

          <div className={`bnd-score-side is-red ${match.activeTurn === 'opponent' && match.status === 'playing' ? 'is-active' : ''}`}>
            <strong className="bnd-score-side__num">{scores.opponent}</strong>
            <span className="bnd-score-side__label">
              {opponent.name} [{opponent.rank}]
            </span>
          </div>
        </div>

        <div className="bnd-match__actions">
          <button
            type="button"
            className="bnd-btn bnd-btn--ghost"
            onClick={() => setShowRulesModal(true)}
          >
            <HelpCircle size={16} /> Rules
          </button>
          <button type="button" className="bnd-btn bnd-btn--ghost" onClick={handleRematch}>
            <RotateCcw size={16} /> Rematch
          </button>
        </div>
      </div>

      {/* Active Rules & Extra-Turn Banner */}
      <div className="bnd-match__banners">
        <div className="bnd-rule-chips">
          <span className="bnd-chip">
            First: {match.firstPlayer === 'player' ? 'Blue (You)' : `Red (${opponent.name})`}
          </span>
          {match.matchRules.length === 0 ? (
            <span className="bnd-chip">Standard Rules (1.00×)</span>
          ) : (
            match.matchRules.map((rid) => {
              const def = getMatchRuleDef(rid);
              return (
                <span key={rid} className="bnd-chip bnd-chip--gold" title={def.description}>
                  {def.name} ({def.multiplier.toFixed(2)}×)
                </span>
              );
            })
          )}
        </div>

        {match.pendingExtraPlay && (
          <div className="bnd-extra-banner">
            <Sparkles size={16} />
            <span>
              {match.pendingExtraPlay.forcedByOpponent
                ? `Sir Sloan's Counter! ${match.pendingExtraPlay.side === 'player' ? 'You are' : 'Opponent is'} forced to play an extra card!`
                : `Brave Activated! Play an extra ${match.pendingExtraPlay.restriction === 'character_only' ? 'Character ' : ''}card!`}
            </span>
          </div>
        )}
      </div>

      {/* Main Arena Grid: Left Sidebar (Opponent + Permanent Slot) | Center 5x5 Board | Right Log */}
      <div className="bnd-match__arena">
        {/* Left Column: Opponent Info, Opponent Hand Backs, and Global Permanent Slot */}
        <aside className="bnd-match__sidebar">
          <div
            className="bnd-duelist-box"
            style={{ borderColor: opponent.avatarTheme.accent }}
          >
            <div
              className="bnd-duelist-box__avatar"
              style={{ background: opponent.avatarTheme.primary }}
            >
              {opponent.avatarTheme.emblem}
            </div>
            <div>
              <div className="bnd-duelist-box__name">
                {opponent.name} <span className={`bnd-rank-tag rank-${opponent.rank}`}>Rank {opponent.rank}</span>
              </div>
              <div className="bnd-duelist-box__sub">{opponent.region}</div>
            </div>
          </div>

          <div className="bnd-opp-hand">
            <div className="bnd-section-label">
              Opponent Hand ({match.hands.opponent.length})
            </div>
            <div className="bnd-opp-hand__cards">
              {match.hands.opponent.map((inst) => (
                <div key={inst.uid} className="bnd-card-back" title="Opponent Card">
                  <span>B’n’D</span>
                </div>
              ))}
            </div>
          </div>

          {/* Global Permanent Effect Zone */}
          <div className={`bnd-perm-zone ${isSelectedPermanent && match.activeTurn === 'player' ? 'is-ready' : ''}`}>
            <div className="bnd-section-label">★ Global Permanent Effect</div>
            {permCardObj ? (
              <div className="bnd-perm-active">
                <img
                  src={getCardImageUrl(permCardObj.id)}
                  alt={permCardObj.name}
                  className="bnd-perm-active__thumb"
                  draggable={false}
                />
                <div className="bnd-perm-active__info">
                  <div className="bnd-perm-active__title">
                    <span>#{permCardObj.code} {permCardObj.name}</span>
                    <small className={match.permanentCard?.playedBy === 'player' ? 'txt-blue' : 'txt-red'}>
                      ({match.permanentCard?.playedBy === 'player' ? 'Yours' : 'Opponent'})
                    </small>
                  </div>
                  <p>
                    {permCardObj.category !== 'Monster' ? permCardObj.abilityText : ''}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bnd-perm-empty">No Permanent Character active.</div>
            )}

            {isSelectedPermanent && match.activeTurn === 'player' && match.status === 'playing' && (
              <button
                type="button"
                className="bnd-btn bnd-btn--gold bnd-btn--full"
                onClick={handleActivatePermanent}
              >
                ★ Activate {selectedCard.name} (Uses Turn)
              </button>
            )}
          </div>

          {match.tempSeals.length > 0 && (
            <div className="bnd-seals-box">
              <div className="bnd-section-label">Active Turn Seals</div>
              {match.tempSeals.map((seal, idx) => (
                <div key={idx} className="bnd-seal-item">
                  🔒 {seal.target === 'player' ? 'You' : 'Opponent'}: {seal.tribes.join(', ')}
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Center 5x5 Tactical Grid */}
        <section className="bnd-board-wrap">
          <div className="bnd-board">
            {match.board.map((row, r) =>
              row.map((cell, c) => {
                const key = `${r},${c}`;
                const prevTag = previewTags.get(key);
                const lastKind = highlightLookup.get(key);
                const canPlaceHere =
                  match.status === 'playing' &&
                  match.activeTurn === 'player' &&
                  cell.owner === 'neutral' &&
                  selectedCard !== null &&
                  !isSelectedPermanent;

                // Hide opponent's secret Counter medals from player UI!
                const showMedal =
                  cell.medal !== null &&
                  !(cell.medal.owner === 'opponent' && cell.medal.hiddenFromOpponent);
                const medalCard = showMedal && cell.medal ? getCardById(cell.medal.cardId) : null;

                return (
                  <button
                    key={key}
                    type="button"
                    className={[
                      'bnd-cell',
                      `owner-${cell.owner}`,
                      cell.fortified ? 'is-fortified' : '',
                      cell.poisonTurns > 0 ? 'is-poisoned' : '',
                      canPlaceHere ? 'is-targetable' : '',
                      prevTag ? prevTag.cls : '',
                      lastKind ? `anim-${lastKind}` : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onMouseEnter={() => {
                      if (canPlaceHere) {
                        soundEngine.playHover();
                        setHoverCell([r, c]);
                      }
                    }}
                    onMouseLeave={() => setHoverCell(null)}
                    onClick={() => handleBoardCellClick(r, c)}
                    title={
                      medalCard
                        ? `Medal: #${medalCard.code} ${medalCard.name}${cell.medal?.hiddenFromOpponent ? ' (Hidden from Opponent)' : ''}`
                        : `Row ${r + 1}, Col ${c + 1}`
                    }
                  >
                    <span className="bnd-cell__coord">
                      {r + 1},{c + 1}
                    </span>

                    {cell.fortified && (
                      <span className="bnd-cell__ward" title="Fortified (Blocks 1 Neutralize/Flank/Poison)">
                        <Shield size={15} />
                      </span>
                    )}

                    {cell.poisonTurns > 0 && (
                      <span className="bnd-cell__poison" title={`Poisoned: reverts to Neutral in ${cell.poisonTurns} turn(s)`}>
                        <Skull size={13} /> {cell.poisonTurns}
                      </span>
                    )}

                    {medalCard && (
                      <div className="bnd-cell__medal">
                        <img
                          src={getCardImageUrl(medalCard.id)}
                          alt={medalCard.name}
                          className="bnd-cell__medal-avatar"
                          draggable={false}
                        />
                        <span>
                          {cell.medal?.hiddenFromOpponent ? '👁️ ' : ''}
                          {medalCard.name}
                        </span>
                      </div>
                    )}

                    {prevTag && (
                      <div className="bnd-cell__preview-tag">{prevTag.label}</div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Live Placement Helper Caption */}
          <div className="bnd-board-caption">
            {match.status !== 'playing' ? (
              <span>{match.winReason}</span>
            ) : match.activeTurn === 'opponent' ? (
              <span>⏳ {opponent.name} is pondering their move...</span>
            ) : !playerHasMove ? (
              <span className="txt-warn">
                No playable cards available! You must Pass Turn (discards 1 random card).
              </span>
            ) : isSelectedPermanent && selectedCard ? (
              <span>
                Selected <strong>{selectedCard.name}</strong> (0-Square Permanent) — click{' '}
                <strong>Activate {selectedCard.name}</strong> on the left panel!
              </span>
            ) : preview ? (
              <span>
                Previewing <strong>{selectedCard?.name}</strong>: +{1 + preview.claimedCells.length + preview.flankedCells.length} Claimed/Flanked
                {preview.neutralizedCells.length > 0 && ` • ${preview.neutralizedCells.length} Neutralized`}
                {preview.shieldBreakCells.length > 0 && ` • ${preview.shieldBreakCells.length} Ward Broken`}
              </span>
            ) : (
              <span>Select a card below and hover any empty Neutral square to preview placement.</span>
            )}
          </div>
        </section>

        {/* Right Column: Battle Log */}
        <aside className="bnd-match__log">
          <div className="bnd-section-label">Match Chronicle</div>
          <div className="bnd-log-list">
            {match.log.map((entry) => (
              <div key={entry.id} className={`bnd-log-item side-${entry.side}`}>
                <span className="bnd-log-item__turn">T{entry.turn}</span>
                <span>{entry.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </aside>
      </div>

      {/* Player Hand & Pass Control */}
      <div className="bnd-player-tray">
        <div className="bnd-player-tray__header">
          <span className="bnd-section-label">
            Your Hand ({match.hands.player.length})
          </span>
          {match.status === 'playing' && match.activeTurn === 'player' && (
            <button
              type="button"
              className={`bnd-btn ${!playerHasMove ? 'bnd-btn--gold' : 'bnd-btn--ghost'}`}
              onClick={handlePassTurn}
              title="Passing consumes your turn and randomly discards 1 card from your hand."
            >
              Pass Turn (Discard 1)
            </button>
          )}
        </div>

        <div className="bnd-hand-row">
          {match.hands.player.map((inst) => {
            const card = getCardById(inst.cardId);
            const eff = getCardEffectiveState(match, 'player', card.id, false);
            const lockReason = getCardPlayLockReason(match, 'player', card.id);
            const isSel = inst.uid === selectedUid;

            return (
              <CardView
                key={inst.uid}
                card={card}
                effectiveState={eff.state}
                effectivePattern={eff.pattern}
                selected={isSel}
                lockedReason={lockReason}
                onClick={() => {
                  if (lockReason || match.activeTurn !== 'player' || match.status !== 'playing') {
                    return;
                  }
                  soundEngine.playSelectCard();
                  setSelectedUid(inst.uid);
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Post-Match Outcome & Reward / Keepsies Modal */}
      {match.status !== 'playing' && (
        <div className="bnd-modal-backdrop">
          <div className="bnd-modal bnd-outcome-modal">
            <div className={`bnd-outcome-header status-${match.status}`}>
              <Trophy size={28} />
              <div>
                <h2>
                  {match.status === 'player_win'
                    ? 'VICTORY!'
                    : match.status === 'draw'
                    ? 'DRAW'
                    : 'DEFEAT'}
                </h2>
                <p>{match.winReason}</p>
              </div>
            </div>

            <div className="bnd-outcome-quote">
              <strong>{opponent.name}:</strong> “
              {match.status === 'player_win' ? opponent.quoteLose : opponent.quoteWin}”
            </div>

            {match.status === 'player_win' ? (
              <>
                <div className="bnd-pts-breakdown">
                  <div>
                    <span>Controlled Squares</span>
                    <strong>{scores.player}</strong>
                  </div>
                  <div>
                    <span>Rank {opponent.rank} Bonus</span>
                    <strong>×{RANK_MULTIPLIERS[opponent.rank].toFixed(2)}</strong>
                  </div>
                  <div>
                    <span>Rule Multiplier</span>
                    <strong>×{calculateRuleMultiplier(match.matchRules).toFixed(2)}</strong>
                  </div>
                  <div className="is-total">
                    <span>Earned Points</span>
                    <strong>+{earnedPoints} Pt</strong>
                  </div>
                </div>

                <div className="bnd-reward-shop">
                  <div className="bnd-reward-shop__head">
                    <h3>Claim Opponent Cards</h3>
                    <span>Your Balance: <strong>{profile.points} Pt</strong></span>
                  </div>
                  <div className="bnd-reward-grid">
                    {opponent.rewardCards.map((cid) => {
                      const c = getCardById(cid);
                      const { cost, mode } = getCardPurchaseCost(profile, cid);
                      const owned = profile.ownedCounts[cid] ?? 0;
                      const alreadyBought = claimedThisMatch.includes(cid);
                      const canAfford = profile.points >= cost && !alreadyBought;

                      return (
                        <div key={cid} className="bnd-reward-item">
                          <CardView card={c} ownedCount={owned} compact />
                          <button
                            type="button"
                            className="bnd-btn bnd-btn--gold bnd-btn--sm"
                            disabled={!canAfford}
                            onClick={() => {
                              soundEngine.playCharacterAura();
                              setClaimedThisMatch((prev) => [...prev, cid]);
                              onClaimRewardCard(cid, cost);
                            }}
                          >
                            {alreadyBought
                              ? '✓ Claimed'
                              : `${mode === 'first' ? 'Unlock' : mode === 'reacquire' ? 'Reclaim' : 'Buy Copy'} (${cost} Pt)`}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="bnd-keepsies-panel">
                {lostCardId !== undefined ? (
                  <div className="bnd-keepsies-loss">
                    <Swords size={20} />
                    <div>
                      <strong>Keepsies Penalty:</strong> You lost 1 copy of{' '}
                      <strong>#{getCardById(lostCardId).code} {getCardById(lostCardId).name}</strong>!
                      <small>
                        (If you have 0 copies left, you can re-acquire it anytime in the Card Binder.)
                      </small>
                    </div>
                  </div>
                ) : (
                  <div className="bnd-keepsies-safe">
                    <Shield size={18} />
                    <span>
                      {profile.sandboxUnlockAll
                        ? 'Sandbox Mode Active — No cards lost.'
                        : 'No Keepsies Active — Your deck is safe!'}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="bnd-modal__footer">
              <button type="button" className="bnd-btn bnd-btn--ghost" onClick={onBackToTavern}>
                Return to Tavern
              </button>
              <button type="button" className="bnd-btn bnd-btn--gold" onClick={handleRematch}>
                <RotateCcw size={16} /> Rematch {opponent.name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Rules Reference Modal */}
      {showRulesModal && (
        <div className="bnd-modal-backdrop" onClick={() => setShowRulesModal(false)}>
          <div className="bnd-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Bind & Divide — Official Rules</h2>
            <ul className="bnd-rules-list">
              <li>
                <strong>Primary Square (Bright Green):</strong> Must always be placed on an unoccupied Neutral square on the 5×5 board.
              </li>
              <li>
                <strong>Secondary Squares (Dark Green / Purple):</strong> Claim Neutral squares and <strong>Neutralize</strong> enemy squares back to Neutral BEFORE flanking checks!
              </li>
              <li>
                <strong>8-Way Flanking (Bind):</strong> Sandwiching a contiguous line of enemy squares (horizontally, vertically, or diagonally) between a newly claimed square and another friendly square flips them to your color!
              </li>
              <li>
                <strong>Fortify (Shield) & Poison (Skull):</strong> Fortified squares block 1 Neutralize, Flank, or Poison hit. Poisoned squares revert to Neutral after 3 turns unless cured by overlaying your own Secondary square or Fortifying.
              </li>
              <li>
                <strong>Medals & Permanent Slot:</strong> Job & Placed Character cards with Extended effects leave a Medal on their Base square (lost if flipped or neutralized). 0-Square Permanent Character cards (★) occupy the single shared Global Permanent Slot, overwriting any previous Permanent card.
              </li>
            </ul>
            <div className="bnd-modal__footer">
              <button
                type="button"
                className="bnd-btn bnd-btn--gold"
                onClick={() => setShowRulesModal(false)}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
