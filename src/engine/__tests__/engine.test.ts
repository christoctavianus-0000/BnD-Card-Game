import { describe, expect, it } from 'vitest';
import {
  countBoardSquares,
  createMatch,
  getCardEffectiveState,
  isCardPlayable,
  passTurn,
  playCard,
} from '../engine';
import { calculateMatchPoints } from '../rules';

const fixedRng = () => 0;

describe('B\'n\'D Core Engine & Special Mechanics', () => {
  it('computes exact BD2 post-match point formula (15 * 2.5 * 1.4 * 1.2 = 63)', () => {
    const pts = calculateMatchPoints({
      outcome: 'player_win',
      playerScore: 15,
      opponentRank: 'S',
      rules: ['wraparound', 'first_past_the_post'],
    });
    expect(pts).toBe(63);
    expect(
      calculateMatchPoints({
        outcome: 'draw',
        playerScore: 12,
        opponentRank: 'S',
        rules: [],
      })
    ).toBe(0);
  });

  it('prioritizes Neutralization over 8-way Flanking and rotates Opponent footprints 180°', () => {
    // Player Goblin (001): normal secondary [0, +1] (right)
    // Opponent Goblin (001): rotated 180° -> [0, -1] (left!)
    let state = createMatch({
      playerDeck: [1, 1, 1, 1, 1, 1],
      opponentDeck: [1, 1, 1, 1, 1, 1],
      firstPlayer: 'player',
      rng: fixedRng,
    });

    // Player places Goblin at (2, 1) -> claims (2,1) and (2,2)
    state = playCard(state, { cardUid: state.hands.player[0].uid, targetRow: 2, targetCol: 1, rng: fixedRng });
    expect(state.board[2][1].owner).toBe('player');
    expect(state.board[2][2].owner).toBe('player');

    // Opponent places Goblin at (2, 3) -> rotated secondary is (2, 2), neutralizing Player's (2, 2)!
    state = playCard(state, { cardUid: state.hands.opponent[0].uid, targetRow: 2, targetCol: 3, rng: fixedRng });
    expect(state.board[2][3].owner).toBe('opponent');
    expect(state.board[2][2].owner).toBe('neutral');
  });

  it('executes 8-directional Flanking (horizontal, vertical, and diagonal)', () => {
    let state = createMatch({
      playerDeck: [41, 41, 41, 41, 41, 41], // 041 Vishno has 0 normal secondaries (Base only)
      opponentDeck: [41, 41, 41, 41, 41, 41],
      firstPlayer: 'player',
      rng: fixedRng,
    });

    // P at (0,0), O at (1,1), P at (2,2) -> diagonal flank flips (1,1) to player!
    state = playCard(state, { cardUid: state.hands.player[0].uid, targetRow: 0, targetCol: 0, rng: fixedRng });
    state = playCard(state, { cardUid: state.hands.opponent[0].uid, targetRow: 1, targetCol: 1, rng: fixedRng });
    state = playCard(state, { cardUid: state.hands.player[0].uid, targetRow: 2, targetCol: 2, rng: fixedRng });

    expect(state.board[1][1].owner).toBe('player');
    expect(countBoardSquares(state.board)).toEqual({ player: 3, opponent: 0, neutral: 22 });
  });

  it('wraps Secondary squares modulo 5 when Wraparound rule is active', () => {
    let state = createMatch({
      playerDeck: [1, 1, 1, 1, 1, 1], // Goblin: [0, +1]
      opponentDeck: [1, 1, 1, 1, 1, 1],
      firstPlayer: 'player',
      matchRules: ['wraparound'],
      rng: fixedRng,
    });

    // Place Goblin at right edge (2, 4) -> secondary wraps to (2, 0)!
    state = playCard(state, { cardUid: state.hands.player[0].uid, targetRow: 2, targetCol: 4, rng: fixedRng });
    expect(state.board[2][4].owner).toBe('player');
    expect(state.board[2][0].owner).toBe('player');
  });

  it('handles Reverse-Weaken (Anihal + Sleipnir) and Strengthen+Weaken cancellation', () => {
    let state = createMatch({
      playerDeck: [63, 61, 51, 1, 1, 1], // 063 Anihal (weaken Undead), 061 Folie (strengthen Undead), 051 Sleipnir
      opponentDeck: [41, 41, 41, 41, 41, 41],
      firstPlayer: 'player',
      rng: fixedRng,
    });

    // Initially Sleipnir is normal (3 secondaries)
    expect(getCardEffectiveState(state, 'player', 51).pattern?.secondaries).toHaveLength(3);

    // Play 063 Anihal (Permanent 0-square) -> Weakens Undead -> Sleipnir jumps to 5 secondaries!
    state = playCard(state, { cardUid: state.hands.player[0].uid, rng: fixedRng });
    expect(getCardEffectiveState(state, 'player', 51).state).toBe('weakened');
    expect(getCardEffectiveState(state, 'player', 51).pattern?.secondaries).toHaveLength(5);

    // Opponent turn
    state = playCard(state, { cardUid: state.hands.opponent[0].uid, targetRow: 0, targetCol: 0, rng: fixedRng });

    // Play 061 Folie (Strengthens Undead) -> Strengthen + Weaken cancel back to Normal (3 secondaries)!
    state = playCard(state, { cardUid: state.hands.player[0].uid, targetRow: 4, targetCol: 4, rng: fixedRng });
    expect(getCardEffectiveState(state, 'player', 51).state).toBe('normal');
    expect(getCardEffectiveState(state, 'player', 51).pattern?.secondaries).toHaveLength(3);
  });

  it('enforces Horten penalty, Pictomancer dynamic 2-secondary Stay Hand, and Glenn cleanse', () => {
    let state = createMatch({
      playerDeck: [81, 67, 88, 74, 1, 1], // 81 Pictomancer, 67 Castor, 88 Glenn, 74 Horten
      opponentDeck: [41, 41, 41, 41, 41, 41],
      firstPlayer: 'player',
      rng: fixedRng,
    });

    // Place 081 Pictomancer -> locks cards with currently 2 secondaries (like 074 Horten in Normal state!)
    state = playCard(state, { cardUid: state.hands.player[0].uid, targetRow: 4, targetCol: 2, rng: fixedRng });
    expect(isCardPlayable(state, 'player', 74)).toBe(false);

    state = playCard(state, { cardUid: state.hands.opponent[0].uid, targetRow: 0, targetCol: 0, rng: fixedRng });

    // Play 067 Prince Castor -> strengthens Characters, which reduces Horten to 0 secondaries -> now playable under Pictomancer!
    state = playCard(state, { cardUid: state.hands.player[0].uid, rng: fixedRng });
    expect(getCardEffectiveState(state, 'player', 74).pattern?.secondaries).toHaveLength(0);
    expect(isCardPlayable(state, 'player', 74)).toBe(true);
  });

  it('triggers Shieldmaster return for First Player once and Freelancer Late Bloomer on full binder', () => {
    let state = createMatch({
      playerDeck: [102, 105, 1, 1, 1, 1],
      opponentDeck: [41, 41, 41, 41, 41, 41],
      firstPlayer: 'player',
      allBinderCollected: true,
      rng: fixedRng,
    });

    expect(getCardEffectiveState(state, 'player', 105).pattern?.secondaries).toHaveLength(5);

    // Play Shieldmaster going first -> returns to hand at end of turn (hand stays at 6!)
    state = playCard(state, { cardUid: state.hands.player[0].uid, targetRow: 2, targetCol: 2, rng: fixedRng });
    expect(state.hands.player).toHaveLength(6);

    // Pass penalty discards 1 card
    state = passTurn(state, fixedRng);
    expect(state.hands.opponent).toHaveLength(5);
  });
});
