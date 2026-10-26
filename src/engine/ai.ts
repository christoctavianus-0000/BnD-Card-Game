import { getCardById } from '../data/cards';
import type { MatchState, OpponentRank, PlayerSide } from '../types/bnd';
import {
  cloneMatchState,
  countBoardSquares,
  hasAnyPlayableMove,
  isCardPlayable,
  otherSide,
  playCard,
} from './engine';

export interface AiChosenAction {
  type: 'play' | 'pass';
  cardUid?: string;
  targetRow?: number;
  targetCol?: number;
}

const deterministicRng = () => 0.5;

/**
 * Masks hidden medals belonging to the enemy so the AI never cheats by peeking at secret Counters!
 */
function maskHiddenEnemyMedals(state: MatchState, aiSide: PlayerSide): MatchState {
  const masked = cloneMatchState(state);
  const humanSide = otherSide(aiSide);
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const m = masked.board[r][c].medal;
      if (m && m.owner === humanSide && m.hiddenFromOpponent) {
        masked.board[r][c].medal = null;
      }
    }
  }
  return masked;
}

function evaluateBoardForSide(state: MatchState, side: PlayerSide): number {
  const enemy = otherSide(side);

  if (state.status !== 'playing') {
    if (
      (side === 'opponent' && state.status === 'opponent_win') ||
      (side === 'player' && state.status === 'player_win')
    ) {
      return 10000;
    }
    if (state.status === 'draw') {
      return -200;
    }
    return -10000;
  }

  const counts = countBoardSquares(state.board);
  const myTiles = side === 'player' ? counts.player : counts.opponent;
  const oppTiles = side === 'player' ? counts.opponent : counts.player;

  let score = (myTiles - oppTiles) * 10;

  // Positional control, Fortify shields, Medals, and Poison awareness
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const cell = state.board[r][c];
      if (cell.owner === 'neutral') continue;

      const sign = cell.owner === side ? 1 : -1;
      const isCorner = (r === 0 || r === 4) && (c === 0 || c === 4);
      const isEdge = r === 0 || r === 4 || c === 0 || c === 4;

      if (!state.matchRules.includes('wraparound')) {
        if (isCorner) score += sign * 4.5;
        else if (isEdge) score += sign * 1.5;
      }

      if (cell.fortified) {
        score += sign * 4.0;
      }
      if (cell.poisonTurns > 0) {
        score -= sign * (4 - cell.poisonTurns) * 2.2;
      }
      if (cell.medal) {
        score += sign * 8.5;
      }
    }
  }

  // Hand advantage (important for Shieldmaster / Sir Sloan!)
  score += (state.hands[side].length - state.hands[enemy].length) * 6.0;

  // Global Permanent card ownership bonus
  if (state.permanentCard) {
    score += state.permanentCard.playedBy === side ? 9.0 : -7.0;
  }

  // First Past the Post proximity awareness
  if (state.matchRules.includes('first_past_the_post')) {
    if (myTiles >= 13) score += (myTiles - 12) * 12;
    if (oppTiles >= 13) score -= (oppTiles - 12) * 14;
  }

  return score;
}

interface CandidateMove {
  cardUid: string;
  cardId: number;
  targetRow?: number;
  targetCol?: number;
  nextState: MatchState;
  immediateScore: number;
}

function enumerateLegalCandidates(state: MatchState, side: PlayerSide): CandidateMove[] {
  const candidates: CandidateMove[] = [];
  const hand = state.hands[side];

  // Deduplicate identical cardIds in hand to avoid redundant simulations
  const seenCardIds = new Set<number>();

  for (const inst of hand) {
    if (seenCardIds.has(inst.cardId)) continue;
    if (!isCardPlayable(state, side, inst.cardId)) continue;
    seenCardIds.add(inst.cardId);

    const card = getCardById(inst.cardId);
    if (card.category !== 'Monster' && card.placementType === 'permanent') {
      // Avoid overwriting own Permanent card with another Permanent card unless beneficial
      if (state.permanentCard?.playedBy === side && state.permanentCard.cardId === card.id) {
        continue;
      }
      const nextState = playCard(state, { cardUid: inst.uid, rng: deterministicRng });
      candidates.push({
        cardUid: inst.uid,
        cardId: inst.cardId,
        nextState,
        immediateScore: evaluateBoardForSide(nextState, side),
      });
    } else {
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (state.board[r][c].owner !== 'neutral') continue;
          const nextState = playCard(state, {
            cardUid: inst.uid,
            targetRow: r,
            targetCol: c,
            rng: deterministicRng,
          });
          candidates.push({
            cardUid: inst.uid,
            cardId: inst.cardId,
            targetRow: r,
            targetCol: c,
            nextState,
            immediateScore: evaluateBoardForSide(nextState, side),
          });
        }
      }
    }
  }

  // Fallback if deduplication skipped only remaining Permanent self-overwrite
  if (candidates.length === 0) {
    for (const inst of hand) {
      if (!isCardPlayable(state, side, inst.cardId)) continue;
      const card = getCardById(inst.cardId);
      if (card.category !== 'Monster' && card.placementType === 'permanent') {
        const nextState = playCard(state, { cardUid: inst.uid, rng: deterministicRng });
        candidates.push({
          cardUid: inst.uid,
          cardId: inst.cardId,
          nextState,
          immediateScore: evaluateBoardForSide(nextState, side),
        });
      }
    }
  }

  return candidates;
}

/**
 * Selects an AI move scaled to the opponent's Rank (C, B, A, or S).
 */
export function chooseAiAction(
  realState: MatchState,
  rank: OpponentRank,
  rng: () => number = Math.random
): AiChosenAction {
  const aiSide = realState.activeTurn;
  if (!hasAnyPlayableMove(realState, aiSide)) {
    return { type: 'pass' };
  }

  const perceivedState = maskHiddenEnemyMedals(realState, aiSide);
  const candidates = enumerateLegalCandidates(perceivedState, aiSide);
  if (candidates.length === 0) {
    return { type: 'pass' };
  }

  // Encourage early setup of Permanent / Extended buff cards on Turns 1-3 for Rank B/A/S
  if (perceivedState.turnNumber <= 3 && rank !== 'C') {
    for (const cand of candidates) {
      const c = getCardById(cand.cardId);
      if (c.category !== 'Monster') {
        if (
          c.placementType === 'permanent' &&
          perceivedState.permanentCard?.playedBy !== aiSide
        ) {
          cand.immediateScore += 14;
        } else if (
          c.effectDuration === 'extended_medal' &&
          (c.abilityFamily === 'Rare Breeds' ||
            c.abilityFamily === 'Ill Breeding' ||
            c.abilityFamily === 'Reinforce' ||
            c.abilityFamily === 'Counter' ||
            c.abilityFamily === 'Brave')
        ) {
          cand.immediateScore += 8;
        }
      }
    }
  }

  // Rank C: Greedy tile count with high noise (friendly beginner AI)
  if (rank === 'C') {
    for (const cand of candidates) {
      cand.immediateScore += (rng() - 0.5) * 22;
    }
    candidates.sort((a, b) => b.immediateScore - a.immediateScore);
    const chosen = candidates[0];
    return {
      type: 'play',
      cardUid: chosen.cardUid,
      targetRow: chosen.targetRow,
      targetCol: chosen.targetCol,
    };
  }

  // Rank B: Tactical 1-ply heuristic with mild variance
  if (rank === 'B') {
    for (const cand of candidates) {
      cand.immediateScore += (rng() - 0.5) * 7;
    }
    candidates.sort((a, b) => b.immediateScore - a.immediateScore);
    const chosen = candidates[0];
    return {
      type: 'play',
      cardUid: chosen.cardUid,
      targetRow: chosen.targetRow,
      targetCol: chosen.targetCol,
    };
  }

  // Rank A & S: Minimax lookahead evaluating opponent's strongest counter-response
  candidates.sort((a, b) => b.immediateScore - a.immediateScore);
  const beamWidth = rank === 'S' ? 12 : 6;
  const topCandidates = candidates.slice(0, beamWidth);

  let bestMove = topCandidates[0];
  let bestMinimaxScore = -Infinity;

  for (const cand of topCandidates) {
    if (cand.nextState.status !== 'playing') {
      const terminalVal = evaluateBoardForSide(cand.nextState, aiSide);
      if (terminalVal > bestMinimaxScore) {
        bestMinimaxScore = terminalVal;
        bestMove = cand;
      }
      continue;
    }

    let val: number;
    const nextActor = cand.nextState.activeTurn;

    if (nextActor === aiSide) {
      // Extra play (Brave): maximize our follow-up!
      const followUps = enumerateLegalCandidates(cand.nextState, aiSide);
      val =
        followUps.length > 0
          ? Math.max(...followUps.map((f) => f.immediateScore))
          : cand.immediateScore;
    } else {
      // Opponent's response: assume opponent picks their strongest reply
      const replies = enumerateLegalCandidates(cand.nextState, nextActor);
      if (replies.length === 0) {
        val = cand.immediateScore + 12;
      } else {
        // Worst outcome for aiSide = minimum of evaluateBoardForSide(reply.nextState, aiSide)
        let worstReplyForAi = Infinity;
        // Check top 8 replies sorted by opponent's immediate gain
        replies.sort((a, b) => b.immediateScore - a.immediateScore);
        const replySample = replies.slice(0, rank === 'S' ? 10 : 5);
        for (const rep of replySample) {
          const scoreAfterReply = evaluateBoardForSide(rep.nextState, aiSide);
          if (scoreAfterReply < worstReplyForAi) {
            worstReplyForAi = scoreAfterReply;
          }
        }
        val = worstReplyForAi * 0.75 + cand.immediateScore * 0.25;
      }
    }

    // Tiny jitter for Rank A, near-zero tie-break jitter for Rank S
    val += (rng() - 0.5) * (rank === 'S' ? 0.8 : 3.2);

    if (val > bestMinimaxScore) {
      bestMinimaxScore = val;
      bestMove = cand;
    }
  }

  return {
    type: 'play',
    cardUid: bestMove.cardUid,
    targetRow: bestMove.targetRow,
    targetCol: bestMove.targetCol,
  };
}
