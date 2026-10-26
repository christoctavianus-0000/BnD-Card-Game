import { getCardById } from '../data/cards';
import type {
  BoardCell,
  CardInstance,
  FootprintPattern,
  FootprintState,
  MatchLogEntry,
  MatchRuleId,
  MatchState,
  MonsterTribe,
  MoveHighlight,
  PlayerSide,
} from '../types/bnd';

export function otherSide(side: PlayerSide): PlayerSide {
  return side === 'player' ? 'opponent' : 'player';
}

export function createEmptyBoard(): BoardCell[][] {
  const board: BoardCell[][] = [];
  for (let r = 0; r < 5; r++) {
    const row: BoardCell[] = [];
    for (let c = 0; c < 5; c++) {
      row.push({
        row: r,
        col: c,
        owner: 'neutral',
        fortified: false,
        poisonTurns: 0,
        medal: null,
      });
    }
    board.push(row);
  }
  return board;
}

export function cloneMatchState(state: MatchState): MatchState {
  return {
    ...state,
    board: state.board.map((row) =>
      row.map((cell) => ({
        ...cell,
        medal: cell.medal ? { ...cell.medal } : null,
      }))
    ),
    hands: {
      player: state.hands.player.map((c) => ({ ...c })),
      opponent: state.hands.opponent.map((c) => ({ ...c })),
    },
    initialDecks: {
      player: [...state.initialDecks.player],
      opponent: [...state.initialDecks.opponent],
    },
    permanentCard: state.permanentCard ? { ...state.permanentCard } : null,
    tempSeals: state.tempSeals.map((s) => ({ ...s, tribes: [...s.tribes] })),
    pendingExtraPlay: state.pendingExtraPlay ? { ...state.pendingExtraPlay } : null,
    shieldmasterUsed: { ...state.shieldmasterUsed },
    matchRules: [...state.matchRules],
    highlights: state.highlights.map((h) => ({ ...h })),
    log: state.log.map((l) => ({ ...l })),
  };
}

export function countBoardSquares(board: BoardCell[][]): {
  player: number;
  opponent: number;
  neutral: number;
} {
  let player = 0;
  let opponent = 0;
  let neutral = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const o = board[r][c].owner;
      if (o === 'player') player++;
      else if (o === 'opponent') opponent++;
      else neutral++;
    }
  }
  return { player, opponent, neutral };
}

function addLog(state: MatchState, side: PlayerSide | 'system', message: string): void {
  const entry: MatchLogEntry = {
    id: state.nextLogId++,
    turn: state.turnNumber,
    side,
    message,
  };
  state.log.push(entry);
}

function pickRandom<T>(items: T[], rng: () => number): T | undefined {
  if (items.length === 0) return undefined;
  const idx = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[idx];
}

function pickRandomN<T>(items: T[], count: number, rng: () => number): T[] {
  const pool = [...items];
  const chosen: T[] = [];
  while (pool.length > 0 && chosen.length < count) {
    const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    chosen.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return chosen;
}

export interface CreateMatchOptions {
  playerDeck: readonly number[];
  opponentDeck: readonly number[];
  firstPlayer?: PlayerSide;
  matchRules?: readonly MatchRuleId[];
  allBinderCollected?: boolean;
  rng?: () => number;
}

export function createMatch(options: CreateMatchOptions): MatchState {
  const rng = options.rng ?? Math.random;
  const firstPlayer: PlayerSide =
    options.firstPlayer ?? (rng() < 0.5 ? 'player' : 'opponent');

  const makeHand = (prefix: string, deck: readonly number[]): CardInstance[] =>
    deck.slice(0, 6).map((cardId, idx) => ({
      uid: `${prefix}_${idx}_${cardId}`,
      cardId,
    }));

  const state: MatchState = {
    board: createEmptyBoard(),
    firstPlayer,
    activeTurn: firstPlayer,
    turnNumber: 1,
    hands: {
      player: makeHand('p', options.playerDeck),
      opponent: makeHand('o', options.opponentDeck),
    },
    initialDecks: {
      player: options.playerDeck.slice(0, 6),
      opponent: options.opponentDeck.slice(0, 6),
    },
    permanentCard: null,
    tempSeals: [],
    pendingExtraPlay: null,
    shieldmasterUsed: { player: false, opponent: false },
    allBinderCollected: Boolean(options.allBinderCollected),
    matchRules: [...(options.matchRules ?? [])],
    status: 'playing',
    highlights: [],
    log: [],
    nextLogId: 1,
    consecutivePasses: 0,
  };

  addLog(
    state,
    'system',
    `Coin toss: ${firstPlayer === 'player' ? 'Blue (You)' : 'Red (Opponent)'} goes first!`
  );

  return state;
}

/**
 * Computes the effective footprint state ('normal' | 'reinforced' | 'weakened') and pattern
 * for a card in hand (or at placement if includeRoddyIntercept is true).
 */
export function getCardEffectiveState(
  state: MatchState,
  side: PlayerSide,
  cardId: number,
  includeRoddyIntercept = false
): { state: FootprintState; pattern: FootprintPattern | null } {
  const card = getCardById(cardId);
  if (card.category !== 'Monster' && card.placementType === 'permanent') {
    return { state: 'normal', pattern: null };
  }

  const counts = countBoardSquares(state.board);
  let hasStrengthen = false;
  let hasWeaken = false;

  // Special self-only strengthen cards (immune to external strengthen, still susceptible to weaken)
  const isBastion = card.id === 66;
  const isFreelancer = card.id === 105;

  if (isBastion) {
    const enemySquares = side === 'player' ? counts.opponent : counts.player;
    if (enemySquares === 13) {
      hasStrengthen = true;
    }
  } else if (isFreelancer) {
    if (state.allBinderCollected) {
      hasStrengthen = true;
    }
  }

  // Evaluate Permanent slot
  const permId = state.permanentCard?.cardId;
  if (permId === 60 && card.category === 'Monster') {
    // 060 Shirley: Humanoid & Spirit strengthen
    if (card.tribe === 'Humanoid' || card.tribe === 'Spirit') {
      hasStrengthen = true;
    }
  } else if (permId === 63 && card.category === 'Monster') {
    // 063 Anihal: Aquatic, Undead, Demon weaken
    if (card.tribe === 'Aquatic' || card.tribe === 'Undead' || card.tribe === 'Demon') {
      hasWeaken = true;
    }
  } else if (permId === 67) {
    // 067 Prince Castor: Plant, Aquatic, and Character cards strengthen
    if (
      (card.category === 'Monster' && (card.tribe === 'Plant' || card.tribe === 'Aquatic')) ||
      card.category === 'Character'
    ) {
      hasStrengthen = true;
    }
  } else if (permId === 68) {
    // 068 Helio: All Job cards strengthen (except Bastion & Freelancer)
    if (card.category === 'Job' && !isBastion && !isFreelancer) {
      hasStrengthen = true;
    }
  }

  // Evaluate active Board Medals
  const baseSecCount = card.normal?.secondaries.length ?? 0;

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const medal = state.board[r][c].medal;
      if (!medal) continue;

      switch (medal.cardId) {
        case 59: // Beastmaster: Beast & Insect strengthen
          if (card.category === 'Monster' && (card.tribe === 'Beast' || card.tribe === 'Insect')) {
            hasStrengthen = true;
          }
          break;
        case 61: // Folie: Undead & Demon strengthen
          if (card.category === 'Monster' && (card.tribe === 'Undead' || card.tribe === 'Demon')) {
            hasStrengthen = true;
          }
          break;
        case 62: // Orpheus: Humanoid & Beast weaken
          if (card.category === 'Monster' && (card.tribe === 'Humanoid' || card.tribe === 'Beast')) {
            hasWeaken = true;
          }
          break;
        case 64: // Lily: Plant & Insect weaken
          if (card.category === 'Monster' && (card.tribe === 'Plant' || card.tribe === 'Insect')) {
            hasWeaken = true;
          }
          break;
        case 65: { // Berserker: Beneficiary's Job cards strengthen when enemy > 10 squares
          const ben = medal.beneficiary;
          const enemyOfBen = ben === 'player' ? counts.opponent : counts.player;
          if (
            side === ben &&
            enemyOfBen > 10 &&
            card.category === 'Job' &&
            !isBastion &&
            !isFreelancer
          ) {
            hasStrengthen = true;
          }
          break;
        }
        case 69: { // Lonsdale: Weakens enemy base-3 cards, strengthens ally base-2 cards
          const ben = medal.beneficiary;
          if (side === otherSide(ben) && baseSecCount === 3) {
            hasWeaken = true;
          }
          if (side === ben && baseSecCount === 2 && !isBastion && !isFreelancer) {
            hasStrengthen = true;
          }
          break;
        }
        case 70: // Phantom: Weakens all Job and Character cards
          if (card.category === 'Job' || card.category === 'Character') {
            hasWeaken = true;
          }
          break;
        case 94: // Roddy (Hidden Counter): Weakens opponent's Monster cards upon placement
          if (
            includeRoddyIntercept &&
            medal.owner === otherSide(side) &&
            card.category === 'Monster'
          ) {
            hasWeaken = true;
          }
          break;
      }
    }
  }

  let finalState: FootprintState = 'normal';
  if (hasStrengthen && hasWeaken) {
    finalState = 'normal';
  } else if (hasStrengthen) {
    finalState = 'reinforced';
  } else if (hasWeaken) {
    finalState = 'weakened';
  }

  return {
    state: finalState,
    pattern: card[finalState],
  };
}

function hasActiveMedal(board: BoardCell[][], cardId: number): boolean {
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (board[r][c].medal?.cardId === cardId) return true;
    }
  }
  return false;
}

/**
 * Returns a human-readable lock reason if a card in hand cannot currently be played, or null if playable.
 */
export function getCardPlayLockReason(
  state: MatchState,
  side: PlayerSide,
  cardId: number
): string | null {
  const card = getCardById(cardId);

  // Red Mage extra play restriction
  if (
    state.pendingExtraPlay &&
    state.pendingExtraPlay.side === side &&
    state.pendingExtraPlay.restriction === 'character_only' &&
    card.category !== 'Character'
  ) {
    return 'Red Mage Brave: Only a Character card can be played.';
  }

  // Glenn (088) disables all Stay Hand effects
  const glennActive = state.permanentCard?.cardId === 88;
  if (!glennActive) {
    // 1-Turn Tribe Seals (080 Bard, 082 Oracle)
    if (card.category === 'Monster') {
      for (const seal of state.tempSeals) {
        if (seal.target === side && seal.tribes.includes(card.tribe)) {
          return `Sealed by Stay Hand (${card.tribe} locked this turn).`;
        }
      }
    }

    // 083 Hellblade: Blocks Character cards
    if (card.category === 'Character' && hasActiveMedal(state.board, 83)) {
      return 'Sealed by Hellblade (Character cards cannot be placed).';
    }

    // Check current modified secondary square count for 081 Pictomancer & 084 Adam
    const isPerm = card.category !== 'Monster' && card.placementType === 'permanent';
    if (!isPerm) {
      const eff = getCardEffectiveState(state, side, cardId, false);
      const secCount = eff.pattern?.secondaries.length ?? 0;

      if (secCount === 2 && hasActiveMedal(state.board, 81)) {
        return 'Sealed by Pictomancer (2-secondary cards locked).';
      }
      if (secCount >= 3 && state.permanentCard?.cardId === 84) {
        return 'Sealed by Adam (3+ secondary cards locked).';
      }
    }
  }

  // Board space check for placed cards
  const isPermanentCard = card.category !== 'Monster' && card.placementType === 'permanent';
  if (!isPermanentCard) {
    const counts = countBoardSquares(state.board);
    if (counts.neutral === 0) {
      return 'No unoccupied Neutral squares remain on the board.';
    }
  }

  return null;
}

export function isCardPlayable(state: MatchState, side: PlayerSide, cardId: number): boolean {
  return getCardPlayLockReason(state, side, cardId) === null;
}

export function hasAnyPlayableMove(state: MatchState, side: PlayerSide): boolean {
  return state.hands[side].some((inst) => isCardPlayable(state, side, inst.cardId));
}

function computeFlankedCoordinates(
  board: BoardCell[][],
  side: PlayerSide,
  anchors: readonly [number, number][]
): [number, number][] {
  const enemy = otherSide(side);
  const dirs: readonly [number, number][] = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ];

  const flankedMap = new Map<string, [number, number]>();

  for (const [ar, ac] of anchors) {
    if (board[ar][ac].owner !== side) continue;
    for (const [dr, dc] of dirs) {
      const line: [number, number][] = [];
      let r = ar + dr;
      let c = ac + dc;
      while (r >= 0 && r < 5 && c >= 0 && c < 5 && board[r][c].owner === enemy) {
        line.push([r, c]);
        r += dr;
        c += dc;
      }
      if (
        line.length > 0 &&
        r >= 0 &&
        r < 5 &&
        c >= 0 &&
        c < 5 &&
        board[r][c].owner === side
      ) {
        for (const coord of line) {
          flankedMap.set(`${coord[0]},${coord[1]}`, coord);
        }
      }
    }
  }

  return [...flankedMap.values()];
}

export interface PreviewPlacementResult {
  primaryCell: [number, number];
  claimedCells: [number, number][];
  neutralizedCells: [number, number][];
  shieldBreakCells: [number, number][];
  flankedCells: [number, number][];
  wrappedCells: [number, number][];
  effectiveState: FootprintState;
}

/**
 * Computes a deterministic hover preview on the 5x5 grid without revealing hidden opponent Counters.
 */
export function previewBoardPlacement(
  state: MatchState,
  side: PlayerSide,
  cardId: number,
  targetRow: number,
  targetCol: number
): PreviewPlacementResult | null {
  if (targetRow < 0 || targetRow >= 5 || targetCol < 0 || targetCol >= 5) return null;
  if (state.board[targetRow][targetCol].owner !== 'neutral') return null;
  if (!isCardPlayable(state, side, cardId)) return null;

  const card = getCardById(cardId);
  if (card.category !== 'Monster' && card.placementType === 'permanent') return null;

  const eff = getCardEffectiveState(state, side, cardId, false);
  if (!eff.pattern) return null;

  const wrap = state.matchRules.includes('wraparound');
  const simBoard = state.board.map((row) => row.map((cell) => ({ ...cell })));
  const enemy = otherSide(side);

  simBoard[targetRow][targetCol].owner = side;
  const newlyClaimed: [number, number][] = [[targetRow, targetCol]];
  const claimedCells: [number, number][] = [];
  const neutralizedCells: [number, number][] = [];
  const shieldBreakCells: [number, number][] = [];
  const wrappedCells: [number, number][] = [];

  for (const [dr, dc] of eff.pattern.secondaries) {
    const rDr: number = side === 'opponent' ? -dr : dr;
    const rDc: number = side === 'opponent' ? -dc : dc;
    const rawR: number = targetRow + rDr;
    const rawC: number = targetCol + rDc;

    let sr: number = rawR;
    let sc: number = rawC;
    let didWrap = false;

    if (rawR < 0 || rawR >= 5 || rawC < 0 || rawC >= 5) {
      if (!wrap) continue;
      sr = ((rawR % 5) + 5) % 5;
      sc = ((rawC % 5) + 5) % 5;
      didWrap = true;
    }

    if (sr === targetRow && sc === targetCol) continue;
    if (didWrap) wrappedCells.push([sr, sc]);

    const cell = simBoard[sr][sc];
    if (cell.owner === 'neutral') {
      cell.owner = side;
      claimedCells.push([sr, sc]);
      newlyClaimed.push([sr, sc]);
    } else if (cell.owner === enemy) {
      if (cell.fortified) {
        cell.fortified = false;
        shieldBreakCells.push([sr, sc]);
      } else if (card.id === 74) {
        // Horten converts neutralized squares directly into Fortified ally squares
        cell.owner = side;
        cell.fortified = true;
        neutralizedCells.push([sr, sc]);
        newlyClaimed.push([sr, sc]);
      } else {
        cell.owner = 'neutral';
        neutralizedCells.push([sr, sc]);
      }
    }
  }

  // Swordmaster (097) preview if neutralization occurred
  if (card.id === 97 && neutralizedCells.length > 0) {
    const fwd = side === 'player' ? -1 : 1;
    const bonusCoords: [number, number][] = [
      [targetRow, targetCol - 1],
      [targetRow, targetCol + 1],
      [targetRow + fwd, targetCol],
    ];
    for (const [br, bc] of bonusCoords) {
      if (br < 0 || br >= 5 || bc < 0 || bc >= 5) continue;
      const bCell = simBoard[br][bc];
      if (bCell.owner === enemy && bCell.fortified) {
        bCell.fortified = false;
        shieldBreakCells.push([br, bc]);
      } else if (bCell.owner !== side) {
        bCell.owner = side;
        claimedCells.push([br, bc]);
        newlyClaimed.push([br, bc]);
      }
    }
  }

  const rawFlanked = computeFlankedCoordinates(simBoard, side, newlyClaimed);
  const flankedCells: [number, number][] = [];
  for (const [fr, fc] of rawFlanked) {
    if (simBoard[fr][fc].fortified) {
      shieldBreakCells.push([fr, fc]);
    } else {
      flankedCells.push([fr, fc]);
    }
  }

  return {
    primaryCell: [targetRow, targetCol],
    claimedCells,
    neutralizedCells,
    shieldBreakCells,
    flankedCells,
    wrappedCells,
    effectiveState: eff.state,
  };
}

function fortifyCell(cell: BoardCell, highlights: MoveHighlight[]): void {
  if (cell.owner === 'neutral') return;
  cell.poisonTurns = 0;
  cell.fortified = true;
  highlights.push({ row: cell.row, col: cell.col, kind: 'fortified' });
}

function applyPoisonToCell(
  state: MatchState,
  cell: BoardCell,
  highlights: MoveHighlight[],
  freshlyPoisonedKeys?: Set<string>
): void {
  if (cell.owner === 'neutral') return;

  // 075 Selene Permanent: turns Poison effects into Fortify!
  if (state.permanentCard?.cardId === 75) {
    fortifyCell(cell, highlights);
    return;
  }

  // 086 Salve-Maker Medal: blocks all Poison effects!
  if (hasActiveMedal(state.board, 86)) {
    return;
  }

  if (cell.fortified) {
    cell.fortified = false;
    highlights.push({ row: cell.row, col: cell.col, kind: 'shield_broken' });
    return;
  }

  cell.poisonTurns = 3;
  highlights.push({ row: cell.row, col: cell.col, kind: 'poisoned' });
  freshlyPoisonedKeys?.add(`${cell.row},${cell.col}`);
}

function checkDomenicTrigger(state: MatchState): void {
  const counts = countBoardSquares(state.board);
  if (counts.player + counts.opponent !== 13) return;

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const medal = state.board[r][c].medal;
      if (medal && medal.cardId === 89) {
        const domOwner = medal.owner;
        const targetEnemy = otherSide(domOwner);
        state.board[r][c].medal = null;

        for (let rr = 0; rr < 5; rr++) {
          for (let cc = 0; cc < 5; cc++) {
            if (state.board[rr][cc].medal?.owner === targetEnemy) {
              state.board[rr][cc].medal = null;
            }
          }
        }
        state.permanentCard = null;
        addLog(
          state,
          domOwner,
          `Domenic triggers at 13 occupied squares! All enemy Extended effects and the Permanent effect are erased!`
        );
      }
    }
  }
}

function findFirstMedalCell(
  board: BoardCell[][],
  owner: PlayerSide,
  cardId: number
): BoardCell | null {
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const m = board[r][c].medal;
      if (m && m.owner === owner && m.cardId === cardId) {
        return board[r][c];
      }
    }
  }
  return null;
}

function resolveEndOfTurn(
  state: MatchState,
  actingSide: PlayerSide,
  returnShieldmaster: boolean,
  rng: () => number
): void {
  const actorLabel = actingSide === 'player' ? 'Blue' : 'Red';

  // 1. 102 Shieldmaster return to hand
  if (returnShieldmaster) {
    state.hands[actingSide].push({
      uid: `${actingSide}_sm_return_${state.turnNumber}`,
      cardId: 102,
    });
    addLog(state, actingSide, `Shieldmaster's Default activates — card returns to ${actorLabel}'s hand!`);
  }

  // 2. Clear 1-turn tribe seals targeting actingSide if their turn is finishing (no immediate extra play)
  const hasValidExtraPlay =
    state.pendingExtraPlay !== null &&
    state.hands[state.pendingExtraPlay.side].some((inst) =>
      isCardPlayable(state, state.pendingExtraPlay!.side, inst.cardId)
    );

  if (!hasValidExtraPlay) {
    state.pendingExtraPlay = null;
    state.tempSeals = state.tempSeals.filter((s) => s.target !== actingSide);
  }

  // 3. Tick existing Poison countdowns (3 -> 2 -> 1 -> 0) BEFORE end-of-turn Emma applies fresh 3-turn poison
  let poisonExpired = false;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const cell = state.board[r][c];
      if (cell.poisonTurns > 0) {
        cell.poisonTurns -= 1;
        if (cell.poisonTurns === 0) {
          cell.owner = 'neutral';
          cell.fortified = false;
          cell.medal = null;
          poisonExpired = true;
          state.highlights.push({ row: r, col: c, kind: 'neutralized' });
        }
      }
    }
  }
  if (poisonExpired) {
    addLog(state, 'system', 'Poisoned territory succumbed and reverted to Neutral!');
  }

  // 4. 079 Lady Emma end-of-turn random Poison
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const medal = state.board[r][c].medal;
      if (medal?.cardId === 79) {
        const occupiedCells: BoardCell[] = [];
        for (let rr = 0; rr < 5; rr++) {
          for (let cc = 0; cc < 5; cc++) {
            if (state.board[rr][cc].owner !== 'neutral') {
              occupiedCells.push(state.board[rr][cc]);
            }
          }
        }
        const chosen = pickRandom(occupiedCells, rng);
        if (chosen) {
          applyPoisonToCell(state, chosen, state.highlights);
          addLog(state, medal.owner, `Lady Emma poisons square (${chosen.row + 1}, ${chosen.col + 1})!`);
        }
      }
    }
  }

  // 5. 098 Martha end-of-opponent's-turn random Neutral claim
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const medal = state.board[r][c].medal;
      if (medal?.cardId === 98 && actingSide === otherSide(medal.beneficiary)) {
        const neutralCells: BoardCell[] = [];
        for (let rr = 0; rr < 5; rr++) {
          for (let cc = 0; cc < 5; cc++) {
            if (state.board[rr][cc].owner === 'neutral') {
              neutralCells.push(state.board[rr][cc]);
            }
          }
        }
        const chosen = pickRandom(neutralCells, rng);
        if (chosen) {
          chosen.owner = medal.beneficiary;
          state.highlights.push({ row: chosen.row, col: chosen.col, kind: 'claimed' });
          addLog(
            state,
            medal.beneficiary,
            `Martha claims neutral square (${chosen.row + 1}, ${chosen.col + 1})!`
          );
        }
      }
    }
  }

  // 6. Check Domenic (13 occupied squares)
  checkDomenicTrigger(state);

  // 7. Evaluate sudden-death and end-of-match victory conditions
  const counts = countBoardSquares(state.board);
  let tentativeStatus: MatchState['status'] = 'playing';
  let tentativeReason: string | undefined;

  if (state.matchRules.includes('wipeout') && state.turnNumber >= 5) {
    if (counts.opponent === 0 && counts.player > 0) {
      tentativeStatus = 'player_win';
      tentativeReason = 'Wipeout! Opponent reduced to 0 squares.';
    } else if (counts.player === 0 && counts.opponent > 0) {
      tentativeStatus = 'opponent_win';
      tentativeReason = 'Wipeout! Your territory was reduced to 0 squares.';
    }
  }

  if (tentativeStatus === 'playing' && state.matchRules.includes('first_past_the_post')) {
    if (counts.player >= 15 && counts.opponent >= 15) {
      if (counts.player > counts.opponent) {
        tentativeStatus = 'player_win';
        tentativeReason = `First Past the Post! Reached ${counts.player} squares.`;
      } else if (counts.opponent > counts.player) {
        tentativeStatus = 'opponent_win';
        tentativeReason = `First Past the Post! Opponent reached ${counts.opponent} squares.`;
      }
    } else if (counts.player >= 15) {
      tentativeStatus = 'player_win';
      tentativeReason = `First Past the Post! Reached ${counts.player} squares.`;
    } else if (counts.opponent >= 15) {
      tentativeStatus = 'opponent_win';
      tentativeReason = `First Past the Post! Opponent reached ${counts.opponent} squares.`;
    }
  }

  const bothHandsEmpty =
    state.hands.player.length === 0 && state.hands.opponent.length === 0;
  const deadlocked = state.consecutivePasses >= 2;

  if (tentativeStatus === 'playing' && (bothHandsEmpty || deadlocked)) {
    if (counts.player > counts.opponent) {
      tentativeStatus = 'player_win';
      tentativeReason = `Final Score ${counts.player} – ${counts.opponent}`;
    } else if (counts.opponent > counts.player) {
      tentativeStatus = 'opponent_win';
      tentativeReason = `Final Score ${counts.player} – ${counts.opponent}`;
    } else {
      tentativeStatus = 'draw';
      tentativeReason = `Draw (${counts.player} – ${counts.opponent})`;
    }
  }

  // 8. 095 Vigintio Counter check when defeat condition is met!
  if (tentativeStatus !== 'playing') {
    const losingSides: PlayerSide[] =
      tentativeStatus === 'player_win'
        ? ['opponent']
        : tentativeStatus === 'opponent_win'
        ? ['player']
        : ['player', 'opponent'];

    for (const loser of losingSides) {
      const vigCell = findFirstMedalCell(state.board, loser, 95);
      if (vigCell) {
        vigCell.medal = null;
        for (const s of ['player', 'opponent'] as const) {
          for (let k = 0; k < 2; k++) {
            const drawnId = pickRandom(state.initialDecks[s], rng);
            if (drawnId !== undefined) {
              state.hands[s].push({
                uid: `${s}_vig_${state.turnNumber}_${k}_${drawnId}`,
                cardId: drawnId,
              });
            }
          }
        }
        state.consecutivePasses = 0;
        state.pendingExtraPlay = null;
        tentativeStatus = 'playing';
        tentativeReason = undefined;
        addLog(
          state,
          loser,
          `Vigintio's Counter activates! Defeat averted — both players draw 2 cards from their decks!`
        );
        // Give the saved player the next turn so they can respond immediately
        state.turnNumber += 1;
        state.activeTurn = loser;
        return;
      }
    }
  }

  if (tentativeStatus !== 'playing') {
    state.status = tentativeStatus;
    state.winReason = tentativeReason;
    addLog(state, 'system', `Match ended: ${tentativeReason}`);
    return;
  }

  // 9. Advance to next turn / extra play
  state.turnNumber += 1;

  if (
    state.pendingExtraPlay &&
    state.hands[state.pendingExtraPlay.side].some((inst) =>
      isCardPlayable(state, state.pendingExtraPlay!.side, inst.cardId)
    )
  ) {
    state.activeTurn = state.pendingExtraPlay.side;
    return;
  }

  state.pendingExtraPlay = null;
  const nextSide = otherSide(actingSide);
  if (state.hands[nextSide].length > 0) {
    state.activeTurn = nextSide;
  } else if (state.hands[actingSide].length > 0) {
    state.activeTurn = actingSide;
  }
}

export interface PlayCardParams {
  cardUid: string;
  targetRow?: number;
  targetCol?: number;
  rng?: () => number;
}

/**
 * Plays a card (either a 0-square Permanent Character card or a board-placed card) on the active turn.
 */
export function playCard(prevState: MatchState, params: PlayCardParams): MatchState {
  if (prevState.status !== 'playing') return prevState;

  const rng = params.rng ?? Math.random;
  const state = cloneMatchState(prevState);
  const side = state.activeTurn;
  const enemy = otherSide(side);
  const actorLabel = side === 'player' ? 'Blue' : 'Red';

  const handIdx = state.hands[side].findIndex((c) => c.uid === params.cardUid);
  if (handIdx === -1) {
    throw new Error(`Card uid ${params.cardUid} not found in ${side}'s hand`);
  }

  const cardInst = state.hands[side][handIdx];
  const card = getCardById(cardInst.cardId);

  const lockReason = getCardPlayLockReason(state, side, card.id);
  if (lockReason) {
    throw new Error(`Cannot play ${card.name}: ${lockReason}`);
  }

  // Consume any active pendingExtraPlay that triggered this play
  if (state.pendingExtraPlay && state.pendingExtraPlay.side === side) {
    state.pendingExtraPlay = null;
  }

  state.highlights = [];
  state.consecutivePasses = 0;

  // === CASE 1: 0-Square Permanent Character Card ===
  if (card.category !== 'Monster' && card.placementType === 'permanent') {
    state.hands[side].splice(handIdx, 1);

    // Check Bernard (071) intercept
    const bernardCell = findFirstMedalCell(state.board, enemy, 71);
    if (bernardCell) {
      bernardCell.medal = null;
      addLog(
        state,
        enemy,
        `Bernard's Co-Opt Card intercepts and cancels ${actorLabel}'s ${card.name}!`
      );
      resolveEndOfTurn(state, side, false, rng);
      return state;
    }

    // Check Thief (092) Counter against 084 Adam (Stay Hand)
    if (card.id === 84) {
      const thiefCell = findFirstMedalCell(state.board, enemy, 92);
      if (thiefCell) {
        addLog(
          state,
          enemy,
          `Thief's Counter intercepts ${actorLabel}'s Adam and cancels Stay Hand!`
        );
        resolveEndOfTurn(state, side, false, rng);
        return state;
      }
    }

    state.permanentCard = { cardId: card.id, playedBy: side };
    addLog(state, side, `${actorLabel} activates Permanent Character card: ${card.name}!`);

    // 075 Selene immediate board cure + fortify
    if (card.id === 75) {
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (state.board[r][c].poisonTurns > 0) {
            fortifyCell(state.board[r][c], state.highlights);
          }
        }
      }
    }

    // 088 Glenn immediate cleanse of all Stay Hand locks
    if (card.id === 88) {
      state.tempSeals = [];
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const m = state.board[r][c].medal;
          if (m && (m.cardId === 81 || m.cardId === 83)) {
            state.board[r][c].medal = null;
          }
        }
      }
    }

    resolveEndOfTurn(state, side, false, rng);
    return state;
  }

  // === CASE 2: Board-Placed Card (Monster, Job, or Placed Character) ===
  const { targetRow, targetCol } = params;
  if (
    targetRow === undefined ||
    targetCol === undefined ||
    targetRow < 0 ||
    targetRow >= 5 ||
    targetCol < 0 ||
    targetCol >= 5
  ) {
    throw new Error('Valid targetRow and targetCol (0..4) required for board-placed card.');
  }

  if (state.board[targetRow][targetCol].owner !== 'neutral') {
    throw new Error(`Square (${targetRow}, ${targetCol}) is not Neutral.`);
  }

  // Determine effective footprint (including hidden 094 Roddy Monster intercept!)
  const roddyCell =
    card.category === 'Monster' ? findFirstMedalCell(state.board, enemy, 94) : null;
  const eff = getCardEffectiveState(state, side, card.id, Boolean(roddyCell));
  if (!eff.pattern) {
    throw new Error(`Missing footprint pattern for card ${card.name}`);
  }

  // Remove card from hand AFTER computing hand-dependent footprint, BEFORE checking hand.length triggers (Red Mage / Bravebearer)
  state.hands[side].splice(handIdx, 1);

  if (roddyCell) {
    addLog(state, enemy, `Roddy's hidden Counter weakens ${actorLabel}'s ${card.name}!`);
  }

  // Check Interceptors: 071 Bernard, 091 Monk, 092 Thief
  let abilityCancelled = false;
  let abilityTargetInverted = false;
  let stealBaseForEnemy = false;
  let monkStealSecondaries = false;

  const bernardCell = findFirstMedalCell(state.board, enemy, 71);
  if (bernardCell) {
    bernardCell.medal = null;
    if (card.category !== 'Monster' && card.singleSideTargeted) {
      abilityTargetInverted = true;
      addLog(
        state,
        enemy,
        `Bernard's Co-Opt Card inverts the target of ${actorLabel}'s ${card.name}!`
      );
    } else {
      abilityCancelled = true;
      stealBaseForEnemy = true;
      addLog(
        state,
        enemy,
        `Bernard's Co-Opt Card cancels ${card.name} and steals its Base square!`
      );
    }
  }

  // 091 Monk Counter against Placed Character cards (090 Marla is immune!)
  if (!abilityCancelled && card.category === 'Character' && card.id !== 90) {
    const monkCell = findFirstMedalCell(state.board, enemy, 91);
    if (monkCell) {
      abilityCancelled = true;
      monkStealSecondaries = true;
      addLog(
        state,
        enemy,
        `Monk's hidden Counter cancels ${card.name} and steals its Secondary squares!`
      );
    }
  }

  // 092 Thief Counter against Stay Hand cards
  if (
    !abilityCancelled &&
    card.category !== 'Monster' &&
    card.abilityFamily === 'Stay Hand' &&
    state.permanentCard?.cardId !== 88
  ) {
    const thiefCell = findFirstMedalCell(state.board, enemy, 92);
    if (thiefCell) {
      abilityCancelled = true;
      stealBaseForEnemy = true;
      addLog(
        state,
        enemy,
        `Thief's hidden Counter cancels ${card.name}'s Stay Hand and steals its Base square!`
      );
    }
  }

  // Place Base Square
  const baseCell = state.board[targetRow][targetCol];
  baseCell.owner = stealBaseForEnemy ? enemy : side;
  baseCell.lastPlayedCardId = card.id;
  state.highlights.push({
    row: targetRow,
    col: targetCol,
    kind: stealBaseForEnemy ? 'stolen' : 'primary',
  });

  const newlyClaimedForSide: [number, number][] = [];
  if (baseCell.owner === side) {
    newlyClaimedForSide.push([targetRow, targetCol]);
  }

  addLog(
    state,
    side,
    `${actorLabel} places ${card.name} at (${targetRow + 1}, ${targetCol + 1}).`
  );

  // Resolve Secondary Squares & Neutralization FIRST
  const wrap = state.matchRules.includes('wraparound');
  let neutralizeCount = 0;
  const hortenFriendlyCells: BoardCell[] = [];

  for (const [dr, dc] of eff.pattern.secondaries) {
    const rDr: number = side === 'opponent' ? -dr : dr;
    const rDc: number = side === 'opponent' ? -dc : dc;
    const rawR: number = targetRow + rDr;
    const rawC: number = targetCol + rDc;

    let sr: number = rawR;
    let sc: number = rawC;
    if (rawR < 0 || rawR >= 5 || rawC < 0 || rawC >= 5) {
      if (!wrap) continue;
      sr = ((rawR % 5) + 5) % 5;
      sc = ((rawC % 5) + 5) % 5;
    }
    if (sr === targetRow && sc === targetCol) continue;

    const cell = state.board[sr][sc];

    if (monkStealSecondaries) {
      if (cell.owner === side && cell.fortified) {
        cell.fortified = false;
        state.highlights.push({ row: sr, col: sc, kind: 'shield_broken' });
      } else {
        if (cell.owner !== enemy) {
          cell.medal = null;
        }
        cell.owner = enemy;
        cell.poisonTurns = 0;
        state.highlights.push({ row: sr, col: sc, kind: 'stolen' });
      }
      continue;
    }

    if (cell.owner === 'neutral') {
      cell.owner = side;
      newlyClaimedForSide.push([sr, sc]);
      state.highlights.push({ row: sr, col: sc, kind: 'claimed' });
    } else if (cell.owner === side) {
      // Overlaying own Secondary square cures own Poison!
      if (cell.poisonTurns > 0) {
        cell.poisonTurns = 0;
      }
      if (!abilityCancelled && card.id === 74) {
        hortenFriendlyCells.push(cell);
      }
    } else if (cell.owner === enemy) {
      if (cell.fortified) {
        cell.fortified = false;
        state.highlights.push({ row: sr, col: sc, kind: 'shield_broken' });
      } else if (!abilityCancelled && card.id === 74) {
        // 074 Horten: Neutralized squares immediately become Fortified ally territory!
        cell.owner = side;
        cell.medal = null;
        cell.poisonTurns = 0;
        cell.fortified = true;
        neutralizeCount += 1;
        newlyClaimedForSide.push([sr, sc]);
        state.highlights.push({ row: sr, col: sc, kind: 'fortified' });
      } else {
        cell.owner = 'neutral';
        cell.medal = null;
        cell.poisonTurns = 0;
        cell.fortified = false;
        neutralizeCount += 1;
        state.highlights.push({ row: sr, col: sc, kind: 'neutralized' });
      }
    }
  }

  if (!abilityCancelled && card.id === 74 && neutralizeCount > 0) {
    for (const fc of hortenFriendlyCells) {
      fortifyCell(fc, state.highlights);
    }
  }

  // Neutralization reactive triggers (076 Galahad, 096 Black Mage, 097 Swordmaster)
  if (neutralizeCount > 0) {
    addLog(state, side, `Neutralized ${neutralizeCount} square${neutralizeCount > 1 ? 's' : ''}!`);

    // 076 Galahad Permanent: Fortifies 1 random occupied square per neutralization
    if (state.permanentCard?.cardId === 76) {
      for (let i = 0; i < neutralizeCount; i++) {
        const candidates: BoardCell[] = [];
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (state.board[r][c].owner !== 'neutral' && !state.board[r][c].fortified) {
              candidates.push(state.board[r][c]);
            }
          }
        }
        const chosen = pickRandom(candidates, rng);
        if (chosen) {
          fortifyCell(chosen, state.highlights);
        }
      }
    }

    // 096 Black Mage Extended Medal: Advances column ahead of Black Mage's Base square
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const m = state.board[r][c].medal;
        if (m && m.cardId === 96 && m.owner === side) {
          const stepR = side === 'player' ? -1 : 1;
          let stepsLeft = neutralizeCount;
          let cr = r + stepR;
          while (cr >= 0 && cr < 5 && stepsLeft > 0) {
            const target = state.board[cr][c];
            if (target.owner === side) {
              cr += stepR;
              continue;
            }
            stepsLeft -= 1;
            if (target.owner === enemy && target.fortified) {
              target.fortified = false;
              state.highlights.push({ row: cr, col: c, kind: 'shield_broken' });
            } else {
              target.owner = side;
              target.medal = null;
              target.poisonTurns = 0;
              newlyClaimedForSide.push([cr, c]);
              state.highlights.push({ row: cr, col: c, kind: 'claimed' });
            }
            cr += stepR;
          }
        }
      }
    }

    // 097 Swordmaster Instant: Claims Left, Right, and Forward of Base square
    if (!abilityCancelled && card.id === 97) {
      const fwd = side === 'player' ? -1 : 1;
      const targets: [number, number][] = [
        [targetRow, targetCol - 1],
        [targetRow, targetCol + 1],
        [targetRow + fwd, targetCol],
      ];
      for (const [tr, tc] of targets) {
        if (tr < 0 || tr >= 5 || tc < 0 || tc >= 5) continue;
        const tCell = state.board[tr][tc];
        if (tCell.owner === enemy && tCell.fortified) {
          tCell.fortified = false;
          state.highlights.push({ row: tr, col: tc, kind: 'shield_broken' });
        } else if (tCell.owner !== side) {
          tCell.owner = side;
          tCell.medal = null;
          tCell.poisonTurns = 0;
          newlyClaimedForSide.push([tr, tc]);
          state.highlights.push({ row: tr, col: tc, kind: 'claimed' });
        }
      }
      addLog(state, side, `Swordmaster slashes Left, Right, and Forward to claim territory!`);
    }
  }

  // Resolve 8-Directional Flanking (挟撃)
  const flankedCoords = computeFlankedCoordinates(state.board, side, newlyClaimedForSide);
  const actuallyFlippedByFlank: BoardCell[] = [];
  let flankOccurred = false;

  if (flankedCoords.length > 0) {
    flankOccurred = true;
    // Check 093 Dag redirect Counter on enemy
    const dagCell = findFirstMedalCell(state.board, enemy, 93);
    const dagDirectlyFlanked =
      dagCell !== null &&
      flankedCoords.some(([fr, fc]) => fr === dagCell.row && fc === dagCell.col);

    if (dagCell && !dagDirectlyFlanked) {
      dagCell.medal = null;
      if (dagCell.fortified) {
        dagCell.fortified = false;
        state.highlights.push({ row: dagCell.row, col: dagCell.col, kind: 'shield_broken' });
      } else {
        dagCell.owner = side;
        dagCell.poisonTurns = 0;
        actuallyFlippedByFlank.push(dagCell);
        state.highlights.push({ row: dagCell.row, col: dagCell.col, kind: 'flanked' });
      }
      addLog(
        state,
        enemy,
        `Dag's Counter intercepts the Flank, sacrificing his Base square to protect allied tiles!`
      );
    } else {
      for (const [fr, fc] of flankedCoords) {
        const fCell = state.board[fr][fc];
        if (fCell.fortified) {
          fCell.fortified = false;
          state.highlights.push({ row: fr, col: fc, kind: 'shield_broken' });
        } else {
          fCell.owner = side;
          fCell.medal = null;
          fCell.poisonTurns = 0;
          actuallyFlippedByFlank.push(fCell);
          state.highlights.push({ row: fr, col: fc, kind: 'flanked' });
        }
      }
      if (actuallyFlippedByFlank.length > 0) {
        addLog(
          state,
          side,
          `Flanked ${actuallyFlippedByFlank.length} square${actuallyFlippedByFlank.length > 1 ? 's' : ''}!`
        );
      }
    }
  }

  // Attach Extended Medal & Execute Instant Placement Effects
  let returnShieldmaster = false;

  if (!abilityCancelled && card.category !== 'Monster') {
    const beneficiary: PlayerSide = abilityTargetInverted ? enemy : side;
    const targetEnemy: PlayerSide = otherSide(beneficiary);

    if (card.effectDuration === 'extended_medal' && baseCell.owner === side) {
      baseCell.medal = {
        cardId: card.id,
        owner: side,
        beneficiary,
        hiddenFromOpponent: Boolean(card.hiddenMedal),
      };
    }

    switch (card.id) {
      case 72: { // Vanguard: Fortify Left & Right occupied squares
        for (const dc of [-1, 1]) {
          const nc = targetCol + dc;
          if (nc >= 0 && nc < 5 && state.board[targetRow][nc].owner !== 'neutral') {
            fortifyCell(state.board[targetRow][nc], state.highlights);
          }
        }
        break;
      }
      case 73: { // Dragoon: Fortify all squares captured by this Flank
        for (const fCell of actuallyFlippedByFlank) {
          fortifyCell(fCell, state.highlights);
        }
        break;
      }
      case 77: { // Ranger: On Flank, Poison Left & Right occupied squares
        if (flankOccurred) {
          for (const dc of [-1, 1]) {
            const nc = targetCol + dc;
            if (nc >= 0 && nc < 5 && state.board[targetRow][nc].owner !== 'neutral') {
              applyPoisonToCell(state, state.board[targetRow][nc], state.highlights);
            }
          }
        }
        break;
      }
      case 78: { // Spiritmaster: Convert all Fortified targetEnemy squares into Poisoned squares
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            const cell = state.board[r][c];
            if (cell.owner === targetEnemy && cell.fortified) {
              cell.fortified = false;
              applyPoisonToCell(state, cell, state.highlights);
            }
          }
        }
        break;
      }
      case 80: { // Bard: Next turn Humanoid, Beast, Aquatic lock
        if (state.permanentCard?.cardId !== 88) {
          const tribes: MonsterTribe[] = ['Humanoid', 'Beast', 'Aquatic'];
          state.tempSeals.push({ target: targetEnemy, tribes, sourceCardId: 80 });
          addLog(state, side, `Bard seals Humanoid, Beast, and Aquatic cards for next turn!`);
        }
        break;
      }
      case 82: { // Oracle: Next turn Plant, Undead, Demon lock
        if (state.permanentCard?.cardId !== 88) {
          const tribes: MonsterTribe[] = ['Plant', 'Undead', 'Demon'];
          state.tempSeals.push({ target: targetEnemy, tribes, sourceCardId: 82 });
          addLog(state, side, `Oracle seals Plant, Undead, and Demon cards for next turn!`);
        }
        break;
      }
      case 85: { // White Mage: Cancel 1 random visible enemy Extended medal
        const visibleEnemyMedals: BoardCell[] = [];
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            const m = state.board[r][c].medal;
            if (m && m.owner === targetEnemy && !m.hiddenFromOpponent) {
              visibleEnemyMedals.push(state.board[r][c]);
            }
          }
        }
        const chosen = pickRandom(visibleEnemyMedals, rng);
        if (chosen && chosen.medal) {
          const removedCard = getCardById(chosen.medal.cardId);
          chosen.medal = null;
          addLog(state, side, `White Mage cleanses ${removedCard.name}'s medal!`);
        }
        break;
      }
      case 86: { // Salve-Maker: Cure all Poisoned squares immediately
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            state.board[r][c].poisonTurns = 0;
          }
        }
        break;
      }
      case 87: { // Arcanist: Neutralize enemy Poisoned squares; cure & Fortify ally Poisoned squares
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            const cell = state.board[r][c];
            if (cell.poisonTurns > 0) {
              if (cell.owner === targetEnemy) {
                cell.owner = 'neutral';
                cell.medal = null;
                cell.fortified = false;
                cell.poisonTurns = 0;
                state.highlights.push({ row: r, col: c, kind: 'neutralized' });
              } else if (cell.owner === beneficiary) {
                fortifyCell(cell, state.highlights);
              }
            }
          }
        }
        break;
      }
      case 90: { // Marla: Cancel 1 random enemy Counter medal
        const counterCells: BoardCell[] = [];
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            const m = state.board[r][c].medal;
            if (m && m.owner === targetEnemy) {
              const mCard = getCardById(m.cardId);
              if (mCard.category !== 'Monster' && mCard.abilityFamily === 'Counter') {
                counterCells.push(state.board[r][c]);
              }
            }
          }
        }
        const chosen = pickRandom(counterCells, rng);
        if (chosen && chosen.medal) {
          const removedCard = getCardById(chosen.medal.cardId);
          chosen.medal = null;
          addLog(state, side, `Marla dispels hidden Counter: ${removedCard.name}!`);
        }
        break;
      }
      case 99: { // Red Mage: Extra Character card if 3 cards remain in hand
        if (state.hands[side].length === 3) {
          state.pendingExtraPlay = {
            side,
            restriction: 'character_only',
            forcedByOpponent: false,
            sourceCardId: 99,
          };
          const canUse = state.hands[side].some((inst) => isCardPlayable(state, side, inst.cardId));
          if (canUse) {
            addLog(state, side, `Red Mage's Brave activates! Play an extra Character card!`);
          } else {
            state.pendingExtraPlay = null;
          }
        }
        break;
      }
      case 100: { // Bravebearer: Extra card of any type if 2 cards remain in hand
        if (state.hands[side].length === 2) {
          state.pendingExtraPlay = {
            side,
            restriction: 'any',
            forcedByOpponent: false,
            sourceCardId: 100,
          };
          const canUse = state.hands[side].some((inst) => isCardPlayable(state, side, inst.cardId));
          if (canUse) {
            addLog(state, side, `Bravebearer's Brave activates! Play an extra card immediately!`);
          } else {
            state.pendingExtraPlay = null;
          }
        }
        break;
      }
      case 102: { // Shieldmaster: Going first, once per match, returns to hand
        if (side === state.firstPlayer && !state.shieldmasterUsed[side]) {
          state.shieldmasterUsed[side] = true;
          returnShieldmaster = true;
        }
        break;
      }
      case 103: { // Gambler: Swap Base square with 1 random enemy square
        if (baseCell.owner === side) {
          const enemyCells: BoardCell[] = [];
          for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 5; c++) {
              if (state.board[r][c].owner === enemy) {
                enemyCells.push(state.board[r][c]);
              }
            }
          }
          const chosen = pickRandom(enemyCells, rng);
          if (chosen) {
            chosen.owner = side;
            chosen.medal = null;
            baseCell.owner = enemy;
            baseCell.medal = null;
            state.highlights.push({ row: chosen.row, col: chosen.col, kind: 'swapped' });
            state.highlights.push({ row: baseCell.row, col: baseCell.col, kind: 'swapped' });
            addLog(
              state,
              side,
              `Gambler's Reversal swaps (${baseCell.row + 1}, ${baseCell.col + 1}) with (${chosen.row + 1}, ${chosen.col + 1})!`
            );
          }
        }
        break;
      }
      case 104: { // Gladys: Neutralize Base + up to 5 random enemy + up to 2 random ally squares
        const enemyPool: BoardCell[] = [];
        const allyPool: BoardCell[] = [];
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (r === targetRow && c === targetCol) continue;
            if (state.board[r][c].owner === enemy) enemyPool.push(state.board[r][c]);
            else if (state.board[r][c].owner === side) allyPool.push(state.board[r][c]);
          }
        }
        const targets = [
          baseCell,
          ...pickRandomN(enemyPool, 5, rng),
          ...pickRandomN(allyPool, 2, rng),
        ];
        for (const tCell of targets) {
          if (tCell.fortified) {
            tCell.fortified = false;
            state.highlights.push({ row: tCell.row, col: tCell.col, kind: 'shield_broken' });
          } else {
            tCell.owner = 'neutral';
            tCell.medal = null;
            tCell.poisonTurns = 0;
            state.highlights.push({ row: tCell.row, col: tCell.col, kind: 'neutralized' });
          }
        }
        addLog(state, side, `Gladys's No Man's Land sweeps the board!`);
        break;
      }
    }
  }

  // Check 089 Domenic conditional trigger immediately after placement
  checkDomenicTrigger(state);

  // Check 101 Sir Sloan Forced Extra Play if a Flank occurred and opponent owns Sir Sloan
  if (flankOccurred && state.hands[side].length > 0) {
    const sloanCell = findFirstMedalCell(state.board, enemy, 101);
    if (sloanCell) {
      state.pendingExtraPlay = {
        side,
        restriction: 'any',
        forcedByOpponent: true,
        sourceCardId: 101,
      };
      addLog(
        state,
        enemy,
        `Sir Sloan's hidden Brave forces ${actorLabel} to immediately play another card!`
      );
    }
  }

  resolveEndOfTurn(state, side, returnShieldmaster, rng);
  return state;
}

/**
 * Passes the active turn (used when locked out by Stay Hand or full board),
 * applying BD2's random 1-card discard penalty.
 */
export function passTurn(prevState: MatchState, rng: () => number = Math.random): MatchState {
  if (prevState.status !== 'playing') return prevState;
  const state = cloneMatchState(prevState);
  const side = state.activeTurn;
  const actorLabel = side === 'player' ? 'Blue' : 'Red';

  state.highlights = [];
  state.consecutivePasses += 1;
  state.pendingExtraPlay = null;

  if (state.hands[side].length > 0) {
    const idx = Math.min(
      state.hands[side].length - 1,
      Math.floor(rng() * state.hands[side].length)
    );
    const [discarded] = state.hands[side].splice(idx, 1);
    const card = getCardById(discarded.cardId);
    addLog(
      state,
      side,
      `${actorLabel} passes — ${card.name} is discarded from hand!`
    );
  } else {
    addLog(state, side, `${actorLabel} passes.`);
  }

  resolveEndOfTurn(state, side, false, rng);
  return state;
}
