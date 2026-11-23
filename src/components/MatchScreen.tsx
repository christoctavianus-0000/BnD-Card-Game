import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  HelpCircle,
  Info,
  RotateCcw,
  ScrollText,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
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
import { useCardDrag } from '../hooks/useCardDrag';
import { useViewportMode } from '../hooks/useViewportMode';
import { useBackHandler } from '../native/backButton';
import {
  canForfeitCardOnKeepsies,
  getCardPurchaseCost,
  type ExtendedPlayerProfile,
} from '../state/profileStore';
import type { MatchRuleId, MatchState, NpcOpponent } from '../types/bnd';
import { CardView, FootprintMiniGrid } from './CardView';
import { CardInspectorSheet, MobileSheet } from './MobileSheet';

export interface MatchScreenProps {
  opponent: NpcOpponent;
  playerDeck: number[];
  matchRules: MatchRuleId[];
  profile: ExtendedPlayerProfile;
  allBinderCollected: boolean;
  muted?: boolean;
  onToggleMute?: () => void;
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
  muted = false,
  onToggleMute,
  onFinishOutcome,
  onClaimRewardCard,
  onBackToTavern,
}) => {
  const { isMobile, isMobileLandscape } = useViewportMode();

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
  const [touchPreviewCell, setTouchPreviewCell] = useState<[number, number] | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [inspectedCardId, setInspectedCardId] = useState<number | null>(null);
  const [outcomeRecorded, setOutcomeRecorded] = useState(false);
  const [lostCardId, setLostCardId] = useState<number | undefined>(undefined);
  const [minDeckProtected, setMinDeckProtected] = useState(false);
  const [claimedThisMatch, setClaimedThisMatch] = useState<number[]>([]);

  const logListRef = useRef<HTMLDivElement | null>(null);
  const lastPointerTypeRef = useRef<string | null>(null);
  const matchRef = useRef<MatchState>(match);
  matchRef.current = match;

  useEffect(() => {
    soundEngine.playCoinToss();
  }, []);

  useEffect(() => {
    if ((!showRulesModal && !showLeaveConfirm) || typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showRulesModal) {
        setShowRulesModal(false);
      } else if (showLeaveConfirm) {
        setShowLeaveConfirm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showRulesModal, showLeaveConfirm]);

  useEffect(() => {
    setTouchPreviewCell(null);
    setHoverCell(null);
  }, [selectedUid, match.turnNumber, match.activeTurn, match.status]);

  const handleRequestLeave = () => {
    if (match.status === 'playing') {
      setShowLeaveConfirm(true);
    } else {
      onBackToTavern();
    }
  };

  useBackHandler(() => {
    if (inspectedCardId !== null) {
      setInspectedCardId(null);
      return true;
    }
    if (showLogSheet) {
      setShowLogSheet(false);
      return true;
    }
    if (showRulesModal) {
      setShowRulesModal(false);
      return true;
    }
    if (showLeaveConfirm) {
      setShowLeaveConfirm(false);
      return true;
    }
    if (touchPreviewCell) {
      setTouchPreviewCell(null);
      setHoverCell(null);
      return true;
    }
    if (match.status === 'playing') {
      setShowLeaveConfirm(true);
      return true;
    }
    onBackToTavern();
    return true;
  }, 20);

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
      if (keepsiesActive && !canForfeitCardOnKeepsies(profile)) {
        setMinDeckProtected(true);
      } else if (keepsiesActive && playerDeck.length > 0) {
        const eligiblePool = playerDeck.filter(
          (id) => (profile.ownedCounts[id] ?? 0) > 0
        );
        const pool = eligiblePool.length > 0 ? eligiblePool : playerDeck;
        chosenLost = pool[Math.floor(Math.random() * pool.length)];
        setLostCardId(chosenLost);
      }
      onFinishOutcome({ earnedPoints: 0, won: false, lostCardId: chosenLost });
    }
  }, [
    match.status,
    outcomeRecorded,
    earnedPoints,
    match.matchRules,
    profile,
    playerDeck,
    onFinishOutcome,
  ]);

  // Scroll only inside the log container so mobile viewport never jumps
  useEffect(() => {
    const el = logListRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [match.log.length, showLogSheet]);

  const executeBoardPlacementForUid = (cardUid: string, r: number, c: number) => {
    const current = matchRef.current;
    if (current.status !== 'playing' || current.activeTurn !== 'player') return;
    const inst = current.hands.player.find((item) => item.uid === cardUid);
    if (!inst) return;
    const card = getCardById(inst.cardId);
    if (card.category !== 'Monster' && card.placementType === 'permanent') return;
    if (getCardPlayLockReason(current, 'player', card.id)) return;
    if (current.board[r][c].owner !== 'neutral') return;

    const next = playCard(current, {
      cardUid: inst.uid,
      targetRow: r,
      targetCol: c,
    });
    triggerMoveSfx(current, next);
    setHoverCell(null);
    setTouchPreviewCell(null);
    setMatch(next);
  };

  const activatePermanentForUid = (cardUid: string) => {
    const current = matchRef.current;
    if (current.status !== 'playing' || current.activeTurn !== 'player') return;
    const inst = current.hands.player.find((item) => item.uid === cardUid);
    if (!inst) return;
    const card = getCardById(inst.cardId);
    if (card.category === 'Monster' || card.placementType !== 'permanent') return;
    if (getCardPlayLockReason(current, 'player', card.id)) return;

    const next = playCard(current, { cardUid: inst.uid });
    triggerMoveSfx(current, next);
    setHoverCell(null);
    setTouchPreviewCell(null);
    setMatch(next);
  };

  const {
    dragSession: dragVisual,
    dragHoverCell,
    ghostRef,
    startCardPointerDown,
    wasJustDragged,
    cancelDrag,
  } = useCardDrag({
    isEnabled: match.status === 'playing' && match.activeTurn === 'player',
    isNeutralCell: (r, c) => matchRef.current.board[r]?.[c]?.owner === 'neutral',
    onDragStart: (cardUid) => {
      setSelectedUid(cardUid);
      setTouchPreviewCell(null);
      setHoverCell(null);
      soundEngine.playSelectCard();
    },
    onHoverCellChange: () => {
      soundEngine.playHover();
    },
    onDropBoard: executeBoardPlacementForUid,
    onDropPermanent: activatePermanentForUid,
  });

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

  const activePreviewCell = dragHoverCell ?? touchPreviewCell ?? hoverCell;

  const preview = useMemo(() => {
    if (
      match.status !== 'playing' ||
      match.activeTurn !== 'player' ||
      !selectedCard ||
      isSelectedPermanent ||
      !activePreviewCell
    ) {
      return null;
    }
    return previewBoardPlacement(
      match,
      'player',
      selectedCard.id,
      activePreviewCell[0],
      activePreviewCell[1]
    );
  }, [match, selectedCard, isSelectedPermanent, activePreviewCell]);

  const executeBoardPlacement = (r: number, c: number) => {
    if (!selectedCardInst) return;
    executeBoardPlacementForUid(selectedCardInst.uid, r, c);
  };

  const handleBoardCellClick = (
    r: number,
    c: number,
    clickDetail = 1,
    medalCardId?: number
  ) => {
    if (wasJustDragged()) return;

    const cell = match.board[r][c];
    if (cell.owner !== 'neutral') {
      if (touchPreviewCell) setTouchPreviewCell(null);
      if (isMobile && medalCardId !== undefined) {
        soundEngine.playHover();
        setInspectedCardId(medalCardId);
      }
      return;
    }

    if (match.status !== 'playing' || match.activeTurn !== 'player') return;
    if (!selectedCardInst || isSelectedPermanent) return;

    const pointerType = lastPointerTypeRef.current;
    lastPointerTypeRef.current = null;
    const isCoarseDevice =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const useTouchPreview =
      pointerType === 'touch' ||
      (pointerType !== 'mouse' && clickDetail > 0 && isCoarseDevice);

    if (useTouchPreview) {
      const isSamePreview =
        touchPreviewCell !== null &&
        touchPreviewCell[0] === r &&
        touchPreviewCell[1] === c;
      if (!isSamePreview) {
        soundEngine.playHover();
        setTouchPreviewCell([r, c]);
        return;
      }
    }

    executeBoardPlacement(r, c);
  };

  const handleActivatePermanent = () => {
    if (!selectedCardInst) return;
    activatePermanentForUid(selectedCardInst.uid);
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
    setMinDeckProtected(false);
    setClaimedThisMatch([]);
    setHoverCell(null);
    setTouchPreviewCell(null);
    cancelDrag();
    setShowLogSheet(false);
    setInspectedCardId(null);
    setMatch(initMatch());
  };

  const handleHandCardPointerDown = (
    instUid: string,
    cardId: number,
    isPermanent: boolean,
    lockedReason: string | null,
    e: React.PointerEvent<HTMLElement>
  ) => {
    if (
      match.status !== 'playing' ||
      match.activeTurn !== 'player' ||
      lockedReason !== null
    ) {
      return;
    }
    startCardPointerDown({ cardUid: instUid, cardId, isPermanent }, e);
  };

  const playerHasMove = hasAnyPlayableMove(match, 'player');
  const permCardObj = match.permanentCard ? getCardById(match.permanentCard.cardId) : null;

  // Build fast lookup maps for hover / touch / drag preview badges
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

  const inspectedHandInst = useMemo(
    () =>
      inspectedCardId !== null
        ? match.hands.player.find((c) => c.cardId === inspectedCardId) ?? null
        : null,
    [match.hands.player, inspectedCardId]
  );

  const inspectedCard = useMemo(
    () => (inspectedCardId !== null ? getCardById(inspectedCardId) : null),
    [inspectedCardId]
  );

  const inspectedEff = useMemo(() => {
    if (!inspectedCard) return null;
    if (!inspectedHandInst) return null;
    return getCardEffectiveState(match, 'player', inspectedCard.id, false);
  }, [inspectedCard, inspectedHandInst, match]);

  const inspectedLockReason = useMemo(() => {
    if (!inspectedCard || !inspectedHandInst) return null;
    return getCardPlayLockReason(match, 'player', inspectedCard.id);
  }, [inspectedCard, inspectedHandInst, match]);

  const ghostCard = dragVisual ? getCardById(dragVisual.cardId) : null;
  const ghostEff = useMemo(() => {
    if (!dragVisual) return null;
    return getCardEffectiveState(match, 'player', dragVisual.cardId, false);
  }, [dragVisual, match]);

  const renderBoardGrid = () => (
    <div
      className={`bnd-board ${
        dragVisual?.isPermanent && dragVisual.overPermZone ? 'is-perm-drop-ready' : ''
      }`}
      data-board-grid="true"
    >
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

          const isTouchPreview =
            (touchPreviewCell !== null &&
              touchPreviewCell[0] === r &&
              touchPreviewCell[1] === c) ||
            (dragHoverCell !== null &&
              dragHoverCell[0] === r &&
              dragHoverCell[1] === c);

          return (
            <button
              key={key}
              type="button"
              data-board-row={r}
              data-board-col={c}
              className={[
                'bnd-cell',
                `owner-${cell.owner}`,
                cell.fortified ? 'is-fortified' : '',
                cell.poisonTurns > 0 ? 'is-poisoned' : '',
                canPlaceHere ? 'is-targetable' : '',
                isTouchPreview ? 'is-touch-preview' : '',
                prevTag ? prevTag.cls : '',
                lastKind ? `anim-${lastKind}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onPointerDown={(e) => {
                lastPointerTypeRef.current = e.pointerType;
              }}
              onMouseEnter={() => {
                if (lastPointerTypeRef.current === 'touch' || dragVisual) return;
                if (canPlaceHere) {
                  soundEngine.playHover();
                  setHoverCell([r, c]);
                }
              }}
              onMouseLeave={() => {
                if (!dragVisual) setHoverCell(null);
              }}
              onClick={(e) => handleBoardCellClick(r, c, e.detail, medalCard?.id)}
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
                  <Shield size={isMobile ? 12 : 15} />
                </span>
              )}

              {cell.poisonTurns > 0 && (
                <span
                  className="bnd-cell__poison"
                  title={`Poisoned: reverts to Neutral in ${cell.poisonTurns} turn(s)`}
                >
                  <Skull size={isMobile ? 10 : 13} /> {cell.poisonTurns}
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

              {prevTag && <div className="bnd-cell__preview-tag">{prevTag.label}</div>}
            </button>
          );
        })
      )}
    </div>
  );

  const renderMobileStatusStrip = () => {
    const ruleSummary =
      match.matchRules.length === 0
        ? 'Standard 1×'
        : match.matchRules.map((rid) => getMatchRuleDef(rid).name).join(' + ');

    const isPermDropHighlighted =
      dragVisual?.isPermanent && dragVisual.overPermZone;

    return (
      <div className="bnd-m-status">
        <div className="bnd-m-status__row">
          <div className="bnd-m-opp-chip">
            <span
              className="bnd-m-opp-chip__avatar"
              style={{
                background: opponent.avatarTheme.primary,
                borderColor: opponent.avatarTheme.accent,
              }}
            >
              {opponent.avatarTheme.emblem}
            </span>
            <span className="bnd-m-opp-chip__name">{opponent.name}</span>
            <span className={`bnd-rank-tag rank-${opponent.rank}`}>{opponent.rank}</span>
            <span className="bnd-m-opp-chip__hand" title="Opponent Cards Remaining">
              🂠 {match.hands.opponent.length}
            </span>
          </div>

          <button
            type="button"
            className="bnd-m-rule-chip"
            onClick={() => setShowRulesModal(true)}
            title="View active match rules"
          >
            {match.firstPlayer === 'player' ? 'You 1st' : 'Opp 1st'} • {ruleSummary}
          </button>

          <button
            type="button"
            data-perm-dropzone="true"
            className={[
              'bnd-m-perm-pill',
              permCardObj ? 'is-active' : '',
              isSelectedPermanent && match.activeTurn === 'player' ? 'is-ready' : '',
              isPermDropHighlighted ? 'is-drop-ready' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              if (permCardObj) {
                soundEngine.playHover();
                setInspectedCardId(permCardObj.id);
              }
            }}
            title={
              permCardObj
                ? `Active Global Permanent: #${permCardObj.code} ${permCardObj.name}`
                : 'Global Permanent Slot (Empty)'
            }
          >
            <span>★</span>
            <span>
              {permCardObj
                ? `${permCardObj.name} (${match.permanentCard?.playedBy === 'player' ? 'You' : 'Opp'})`
                : 'No Perm'}
            </span>
          </button>
        </div>

        {(match.pendingExtraPlay || match.tempSeals.length > 0) && (
          <div className="bnd-m-alerts">
            {match.pendingExtraPlay && (
              <div className="bnd-m-alert is-extra">
                <Sparkles size={13} />
                <span>
                  {match.pendingExtraPlay.forcedByOpponent
                    ? `Counter! ${match.pendingExtraPlay.side === 'player' ? 'You' : 'Opp'} must play extra`
                    : `Brave! Extra ${match.pendingExtraPlay.restriction === 'character_only' ? 'Character ' : ''}play`}
                </span>
              </div>
            )}
            {match.tempSeals.map((seal, idx) => (
              <div key={idx} className="bnd-m-alert is-seal">
                🔒 {seal.target === 'player' ? 'You' : 'Opp'}: {seal.tribes.join(', ')}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderMobileActionBar = () => {
    if (match.status !== 'playing') {
      return (
        <div className="bnd-m-actionbar">
          <span className="bnd-m-actionbar__text">{match.winReason}</span>
        </div>
      );
    }

    if (dragVisual) {
      return (
        <div className="bnd-m-actionbar is-dragging">
          {dragVisual.isPermanent ? (
            <span className="bnd-m-actionbar__text txt-gold">
              {dragVisual.overPermZone
                ? `Release to activate ★ ${ghostCard?.name ?? 'Permanent'}`
                : 'Drag onto board or ★ Permanent pill'}
            </span>
          ) : preview && selectedCard ? (
            <span className="bnd-m-actionbar__text">
              <strong>
                #{selectedCard.code} {selectedCard.name}
              </strong>
              : +{1 + preview.claimedCells.length + preview.flankedCells.length} Sq
              {preview.neutralizedCells.length > 0 && ` • ${preview.neutralizedCells.length} Neut`}
              {preview.shieldBreakCells.length > 0 && ` • ${preview.shieldBreakCells.length} Ward`}
            </span>
          ) : (
            <span className="bnd-m-actionbar__text">
              Drag onto an empty Neutral square
            </span>
          )}
        </div>
      );
    }

    if (match.activeTurn === 'opponent') {
      return (
        <div className="bnd-m-actionbar">
          <span className="bnd-m-actionbar__text">
            ⏳ {opponent.name} is pondering their move...
          </span>
        </div>
      );
    }

    if (!playerHasMove) {
      return (
        <div className="bnd-m-actionbar is-warn">
          <span className="bnd-m-actionbar__text txt-warn">No playable moves!</span>
          <button
            type="button"
            className="bnd-btn bnd-btn--gold bnd-btn--sm"
            onClick={handlePassTurn}
          >
            Pass Turn (Discard 1)
          </button>
        </div>
      );
    }

    if (isSelectedPermanent && selectedCard) {
      return (
        <div className="bnd-m-actionbar is-ready">
          <span className="bnd-m-actionbar__text">
            <strong>#{selectedCard.code} {selectedCard.name}</strong> (0-Sq Perm)
          </span>
          <div className="bnd-m-actionbar__btns">
            <button
              type="button"
              className="bnd-icon-btn bnd-icon-btn--sm"
              aria-label={`Inspect ${selectedCard.name}`}
              onClick={() => setInspectedCardId(selectedCard.id)}
            >
              <Info size={14} />
            </button>
            <button
              type="button"
              className="bnd-btn bnd-btn--gold bnd-btn--sm"
              onClick={handleActivatePermanent}
            >
              ★ Activate
            </button>
          </div>
        </div>
      );
    }

    if (preview && touchPreviewCell && selectedCard) {
      return (
        <div className="bnd-m-actionbar is-preview">
          <span className="bnd-m-actionbar__text">
            <strong>{selectedCard.name}</strong>: +
            {1 + preview.claimedCells.length + preview.flankedCells.length} Sq
            {preview.neutralizedCells.length > 0 && ` • ${preview.neutralizedCells.length} Neut`}
            {preview.shieldBreakCells.length > 0 && ` • ${preview.shieldBreakCells.length} Ward`}
          </span>
          <div className="bnd-m-actionbar__btns">
            <button
              type="button"
              className="bnd-btn bnd-btn--gold bnd-btn--sm"
              onClick={() => executeBoardPlacement(touchPreviewCell[0], touchPreviewCell[1])}
            >
              Confirm
            </button>
            <button
              type="button"
              className="bnd-btn bnd-btn--ghost bnd-btn--sm"
              onClick={() => {
                setTouchPreviewCell(null);
                setHoverCell(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="bnd-m-actionbar">
        <span className="bnd-m-actionbar__text">
          {selectedCard ? (
            <>
              <strong>
                #{selectedCard.code} {selectedCard.name}
              </strong>{' '}
              <span className="bnd-m-actionbar__hint">• Tap or drag to board</span>
            </>
          ) : (
            'Select or drag a card to play'
          )}
        </span>
        <div className="bnd-m-actionbar__btns">
          {selectedCard && (
            <button
              type="button"
              className="bnd-icon-btn bnd-icon-btn--sm"
              aria-label={`Inspect ${selectedCard.name}`}
              onClick={() => setInspectedCardId(selectedCard.id)}
            >
              <Info size={14} />
            </button>
          )}
          <button
            type="button"
            className="bnd-btn bnd-btn--ghost bnd-btn--sm"
            onClick={handlePassTurn}
            title="Passing consumes your turn and randomly discards 1 card."
          >
            Pass
          </button>
        </div>
      </div>
    );
  };

  const renderMobileHandGrid = () => (
    <div className="bnd-m-hand" aria-label="Your Hand">
      {match.hands.player.length === 0 ? (
        <div className="bnd-m-hand__empty">No cards remaining in hand.</div>
      ) : (
        <div className="bnd-m-hand__grid">
          {match.hands.player.map((inst) => {
            const card = getCardById(inst.cardId);
            const eff = getCardEffectiveState(match, 'player', card.id, false);
            const lockReason = getCardPlayLockReason(match, 'player', card.id);
            const isSel = inst.uid === selectedUid;
            const isPerm =
              card.category !== 'Monster' && card.placementType === 'permanent';

            return (
              <CardView
                key={inst.uid}
                card={card}
                variant="battle-tile"
                effectiveState={eff.state}
                effectivePattern={eff.pattern}
                selected={isSel}
                lockedReason={lockReason}
                isDragging={dragVisual?.cardUid === inst.uid}
                onInspect={() => {
                  soundEngine.playHover();
                  setInspectedCardId(card.id);
                }}
                onPointerDown={(e) =>
                  handleHandCardPointerDown(inst.uid, card.id, isPerm, lockReason, e)
                }
                onClick={() => {
                  if (wasJustDragged()) return;
                  if (
                    lockReason ||
                    match.activeTurn !== 'player' ||
                    match.status !== 'playing'
                  ) {
                    return;
                  }
                  soundEngine.playSelectCard();
                  setSelectedUid(inst.uid);
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={[
        'bnd-match',
        isMobile ? 'bnd-match--mobile' : '',
        isMobile && isMobileLandscape ? 'is-landscape' : '',
        isMobile && !isMobileLandscape ? 'is-portrait' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Abandon Match Confirmation Modal */}
      {showLeaveConfirm && (
        <div
          className="bnd-modal-backdrop"
          onClick={() => setShowLeaveConfirm(false)}
        >
          <div
            className="bnd-modal bnd-modal--sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bnd-leave-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="bnd-leave-title">Leave Match?</h2>
            <p className="bnd-modal-copy">
              Abandoning this match against <strong>{opponent.name}</strong> will discard current board progress without rewards.
            </p>
            <div className="bnd-modal__footer">
              <button
                type="button"
                className="bnd-btn bnd-btn--ghost"
                onClick={() => setShowLeaveConfirm(false)}
              >
                Stay at Table
              </button>
              <button
                type="button"
                className="bnd-btn bnd-btn--gold"
                onClick={() => {
                  setShowLeaveConfirm(false);
                  onBackToTavern();
                }}
              >
                Leave Table
              </button>
            </div>
          </div>
        </div>
      )}

      {isMobile ? (
        <>
          {/* Compact Mobile Match Topbar */}
          <div className="bnd-m-topbar">
            <button
              type="button"
              className="bnd-icon-btn"
              onClick={handleRequestLeave}
              aria-label="Leave Match"
              title="Leave Match"
            >
              <ArrowLeft size={17} />
            </button>

            <div className="bnd-m-scoreboard">
              <div
                className={`bnd-m-score is-blue ${
                  match.activeTurn === 'player' && match.status === 'playing' ? 'is-active' : ''
                }`}
              >
                <span>YOU</span>
                <strong>{scores.player}</strong>
              </div>

              <div className="bnd-m-score-mid">
                <span className="bnd-m-turn">
                  T{match.turnNumber}
                  {match.matchRules.includes('first_past_the_post') ? ' • 15★' : ''}
                </span>
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
              </div>

              <div
                className={`bnd-m-score is-red ${
                  match.activeTurn === 'opponent' && match.status === 'playing' ? 'is-active' : ''
                }`}
              >
                <strong>{scores.opponent}</strong>
                <span>{opponent.name.split(' ')[0]}</span>
              </div>
            </div>

            <div className="bnd-m-top-actions">
              <button
                type="button"
                className="bnd-icon-btn"
                onClick={() => setShowLogSheet(true)}
                aria-label="Match Chronicle"
                title="Match Chronicle"
              >
                <ScrollText size={16} />
              </button>
              <button
                type="button"
                className="bnd-icon-btn"
                onClick={() => setShowRulesModal(true)}
                aria-label="Rules"
                title="Rules"
              >
                <HelpCircle size={16} />
              </button>
              {onToggleMute && (
                <button
                  type="button"
                  className="bnd-icon-btn"
                  onClick={onToggleMute}
                  aria-label={muted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
                  title={muted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
                >
                  {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
              )}
              <button
                type="button"
                className="bnd-icon-btn"
                onClick={handleRematch}
                aria-label="Rematch"
                title="Rematch"
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>

          {/* Mobile Arena Body: Portrait Stack OR Dedicated 2-Column Landscape */}
          {isMobileLandscape ? (
            <div className="bnd-m-body is-landscape">
              <section className="bnd-m-board-stage">{renderBoardGrid()}</section>
              <div className="bnd-m-side">
                {renderMobileStatusStrip()}
                {renderMobileActionBar()}
                {renderMobileHandGrid()}
              </div>
            </div>
          ) : (
            <div className="bnd-m-body is-portrait">
              {renderMobileStatusStrip()}
              <section className="bnd-m-board-stage">{renderBoardGrid()}</section>
              {renderMobileActionBar()}
              {renderMobileHandGrid()}
            </div>
          )}

          {/* Mobile Match Chronicle Drawer */}
          <MobileSheet
            open={showLogSheet}
            title="Match Chronicle"
            subtitle={`Turn ${match.turnNumber} • vs. ${opponent.name}`}
            onClose={() => setShowLogSheet(false)}
            backPriority={25}
          >
            <div className="bnd-log-list is-sheet" ref={logListRef}>
              {match.log.map((entry) => (
                <div key={entry.id} className={`bnd-log-item side-${entry.side}`}>
                  <span className="bnd-log-item__turn">T{entry.turn}</span>
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          </MobileSheet>

          {/* Mobile Card Inspector Sheet */}
          <CardInspectorSheet
            open={inspectedCard !== null}
            card={inspectedCard}
            effectiveState={inspectedEff?.state}
            effectivePattern={inspectedEff?.pattern}
            lockReason={inspectedLockReason}
            showSourceHint={false}
            onClose={() => setInspectedCardId(null)}
            backPriority={26}
            footer={
              inspectedHandInst &&
              !inspectedLockReason &&
              match.status === 'playing' &&
              match.activeTurn === 'player' ? (
                <button
                  type="button"
                  className="bnd-btn bnd-btn--gold bnd-btn--full"
                  onClick={() => {
                    soundEngine.playSelectCard();
                    setSelectedUid(inspectedHandInst.uid);
                    setInspectedCardId(null);
                  }}
                >
                  {selectedUid === inspectedHandInst.uid
                    ? '✓ Currently Selected'
                    : 'Select This Card'}
                </button>
              ) : undefined
            }
          />
        </>
      ) : (
        <>
          {/* Desktop Top Duelist & Score Bar */}
          <div className="bnd-match__topbar">
            <button type="button" className="bnd-btn bnd-btn--ghost" onClick={handleRequestLeave}>
              <ArrowLeft size={16} /> Leave Table
            </button>

            <div className="bnd-scoreboard">
              <div
                className={`bnd-score-side is-blue ${
                  match.activeTurn === 'player' && match.status === 'playing' ? 'is-active' : ''
                }`}
              >
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

              <div
                className={`bnd-score-side is-red ${
                  match.activeTurn === 'opponent' && match.status === 'playing' ? 'is-active' : ''
                }`}
              >
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
                    {opponent.name}{' '}
                    <span className={`bnd-rank-tag rank-${opponent.rank}`}>
                      Rank {opponent.rank}
                    </span>
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
              <div
                data-perm-dropzone="true"
                className={`bnd-perm-zone ${
                  isSelectedPermanent && match.activeTurn === 'player' ? 'is-ready' : ''
                } ${dragVisual?.isPermanent && dragVisual.overPermZone ? 'is-drop-ready' : ''}`}
              >
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
                        <span>
                          #{permCardObj.code} {permCardObj.name}
                        </span>
                        <small
                          className={
                            match.permanentCard?.playedBy === 'player' ? 'txt-blue' : 'txt-red'
                          }
                        >
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

                {isSelectedPermanent &&
                  match.activeTurn === 'player' &&
                  match.status === 'playing' && (
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
              {renderBoardGrid()}

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
                  <div className="bnd-board-preview-bar">
                    <span>
                      Previewing <strong>{selectedCard?.name}</strong>: +
                      {1 + preview.claimedCells.length + preview.flankedCells.length} Claimed/Flanked
                      {preview.neutralizedCells.length > 0 &&
                        ` • ${preview.neutralizedCells.length} Neutralized`}
                      {preview.shieldBreakCells.length > 0 &&
                        ` • ${preview.shieldBreakCells.length} Ward Broken`}
                    </span>
                    {touchPreviewCell && (
                      <span className="bnd-board-preview-actions">
                        <button
                          type="button"
                          className="bnd-btn bnd-btn--gold bnd-btn--sm"
                          onClick={() =>
                            executeBoardPlacement(touchPreviewCell[0], touchPreviewCell[1])
                          }
                        >
                          Confirm Place
                        </button>
                        <button
                          type="button"
                          className="bnd-btn bnd-btn--ghost bnd-btn--sm"
                          onClick={() => {
                            setTouchPreviewCell(null);
                            setHoverCell(null);
                          }}
                        >
                          Cancel
                        </button>
                      </span>
                    )}
                  </div>
                ) : (
                  <span>
                    Select a card below and hover or drag onto any empty Neutral square to place.
                  </span>
                )}
              </div>
            </section>

            {/* Right Column: Battle Log */}
            <aside className="bnd-match__log">
              <div className="bnd-section-label">Match Chronicle</div>
              <div className="bnd-log-list" ref={logListRef}>
                {match.log.map((entry) => (
                  <div key={entry.id} className={`bnd-log-item side-${entry.side}`}>
                    <span className="bnd-log-item__turn">T{entry.turn}</span>
                    <span>{entry.message}</span>
                  </div>
                ))}
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
                const isPerm =
                  card.category !== 'Monster' && card.placementType === 'permanent';

                return (
                  <CardView
                    key={inst.uid}
                    card={card}
                    effectiveState={eff.state}
                    effectivePattern={eff.pattern}
                    selected={isSel}
                    lockedReason={lockReason}
                    isDragging={dragVisual?.cardUid === inst.uid}
                    onPointerDown={(e) =>
                      handleHandCardPointerDown(inst.uid, card.id, isPerm, lockReason, e)
                    }
                    onClick={() => {
                      if (wasJustDragged()) return;
                      if (
                        lockReason ||
                        match.activeTurn !== 'player' ||
                        match.status !== 'playing'
                      ) {
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
        </>
      )}

      {/* Floating Drag Ghost */}
      {dragVisual && ghostCard && ghostEff && (
        <div
          ref={ghostRef}
          className="bnd-drag-ghost"
          aria-hidden="true"
        >
          <div className="bnd-drag-ghost__card">
            <img
              src={getCardImageUrl(ghostCard.id)}
              alt=""
              className="bnd-drag-ghost__img"
              draggable={false}
            />
            <FootprintMiniGrid
              pattern={ghostEff.pattern}
              state={ghostEff.state}
              size="md"
            />
          </div>
          <span className="bnd-drag-ghost__dot" />
        </div>
      )}

      {/* Post-Match Outcome & Reward / Keepsies Modal */}
      {match.status !== 'playing' && (
        <div className="bnd-modal-backdrop">
          <div
            className="bnd-modal bnd-outcome-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Match Outcome"
          >
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
                    <span>
                      Your Balance: <strong>{profile.points} Pt</strong>
                    </span>
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
                      <strong>
                        #{getCardById(lostCardId).code} {getCardById(lostCardId).name}
                      </strong>
                      !
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
                        : minDeckProtected
                        ? 'Minimum 6-Card Protection — Your last 6 cards are protected from Keepsies loss.'
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
          <div
            className="bnd-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bnd-rules-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="bnd-rules-title">Bind & Divide — Official Rules</h2>
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
