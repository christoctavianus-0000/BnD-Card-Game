import { describe, expect, it } from 'vitest';
import { getCardById } from '../../data/cards';
import { INITIAL_UNLOCKED_CARD_IDS, NPC_OPPONENTS, STARTER_DECK_IDS } from '../../data/opponents';
import { chooseAiAction } from '../ai';
import { createMatch, passTurn, playCard } from '../engine';

describe('NPC Opponents & AI Full-Match Simulation', () => {
  it('validates all 21 opponent decks and ensures all 105 cards are obtainable', () => {
    expect(STARTER_DECK_IDS).toHaveLength(6);

    const obtainable = new Set<number>(INITIAL_UNLOCKED_CARD_IDS);

    for (const npc of NPC_OPPONENTS) {
      expect(npc.deckFirst, `${npc.id} deckFirst`).toHaveLength(6);
      npc.deckFirst.forEach((id) => expect(getCardById(id)).toBeDefined());

      if (npc.deckSecond) {
        expect(npc.deckSecond, `${npc.id} deckSecond`).toHaveLength(6);
        npc.deckSecond.forEach((id) => expect(getCardById(id)).toBeDefined());
      }

      for (const rid of npc.rewardCards) {
        expect(getCardById(rid)).toBeDefined();
        obtainable.add(rid);
      }
    }

    const missing: number[] = [];
    for (let id = 1; id <= 105; id++) {
      if (!obtainable.has(id)) missing.push(id);
    }
    expect(missing, `Missing cards from opponent drop pools: ${missing.join(', ')}`).toEqual([]);
  });

  it('plays full automated matches across Rank C, B, A, and S duelists without error', () => {
    const sampleOpponents = [
      NPC_OPPONENTS[0], // Shirley (Rank C)
      NPC_OPPONENTS[8], // Arcane Scholar (Rank B - Bernard & Roddy)
      NPC_OPPONENTS[12], // Galahad (Rank A - Reverse Weaken)
      NPC_OPPONENTS[17], // Tru (Rank S - Wraparound)
      NPC_OPPONENTS[20], // Fairy of Mag Mell (Rank S - Sloan & Bravebearer)
    ];

    let seed = 42;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (const npc of sampleOpponents) {
      const oppDeck = npc.deckSecond ?? npc.deckFirst;
      let state = createMatch({
        playerDeck: STARTER_DECK_IDS,
        opponentDeck: oppDeck,
        firstPlayer: 'player',
        matchRules: npc.defaultRules,
        rng,
      });

      let safety = 0;
      while (state.status === 'playing' && safety < 50) {
        safety++;
        const action = chooseAiAction(state, npc.rank, rng);
        if (action.type === 'pass') {
          state = passTurn(state, rng);
        } else {
          state = playCard(state, {
            cardUid: action.cardUid!,
            targetRow: action.targetRow,
            targetCol: action.targetCol,
            rng,
          });
        }
      }

      expect(safety).toBeLessThan(50);
      expect(['player_win', 'opponent_win', 'draw']).toContain(state.status);
    }
  });
});
