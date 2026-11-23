import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyMatchOutcomeToProfile,
  canForfeitCardOnKeepsies,
  createDefaultProfile,
  getCardPurchaseCost,
  getEffectiveOwnedCount,
  getEffectiveRank,
  getTotalOwnedCardCount,
  grantOrBuyCard,
  isBinderComplete,
  loadProfile,
} from '../profileStore';

describe('Player Profile, Point Shop & Keepsies Persistence', () => {
  it('initializes default Savalon progression profile with 7 starter cards and 5 valid 6-card decks', () => {
    const profile = createDefaultProfile();
    expect(profile.points).toBe(25);
    expect(profile.rank).toBe('C');
    expect(profile.everCollected).toHaveLength(7);
    expect(profile.decks).toHaveLength(5);
    for (const d of profile.decks) {
      expect(d.cards).toHaveLength(6);
    }
    expect(isBinderComplete(profile)).toBe(false);
  });

  it('upgrades player rank at cumulative point milestones (200 -> B, 700 -> A, 1500 -> S)', () => {
    let profile = createDefaultProfile();
    profile = applyMatchOutcomeToProfile(profile, {
      npcId: 'shirley_savalon',
      earnedPoints: 210,
      won: true,
    });
    expect(profile.rank).toBe('B');
    expect(profile.npcWins.shirley_savalon).toBe(1);

    profile = applyMatchOutcomeToProfile(profile, {
      npcId: 'shirley_savalon',
      earnedPoints: 500,
      won: true,
    });
    expect(profile.rank).toBe('A');

    profile = applyMatchOutcomeToProfile(profile, {
      npcId: 'shirley_savalon',
      earnedPoints: 850,
      won: true,
    });
    expect(profile.rank).toBe('S');
    expect(getEffectiveRank(profile)).toBe('S');
  });

  it('handles Keepsies loss, marks 0-copy cards as lost, repairs decks, and calculates 2/3 re-acquire cost', () => {
    let profile = createDefaultProfile();
    // Lose card #103 (Gambler, firstPt = 20, repeatPt = 10, reacquirePt = floor(40/3) = 13)
    profile = applyMatchOutcomeToProfile(profile, {
      npcId: 'anihal_savalon',
      earnedPoints: 0,
      won: false,
      lostCardId: 103,
    });

    expect(profile.ownedCounts[103]).toBe(0);
    expect(profile.lostCards).toContain(103);
    // All saved decks must still have 6 cards and 0 copies of #103
    for (const d of profile.decks) {
      expect(d.cards).toHaveLength(6);
      expect(d.cards).not.toContain(103);
    }

    const reacquire = getCardPurchaseCost(profile, 103);
    expect(reacquire).toEqual({ cost: 13, mode: 'reacquire' });

    // Re-buy Gambler in the Point Shop
    profile = grantOrBuyCard(profile, 103, reacquire.cost);
    expect(profile.ownedCounts[103]).toBe(1);
    expect(profile.lostCards).not.toContain(103);

    // Buying an additional duplicate copy costs repeatPt (10 Pt)
    const duplicate = getCardPurchaseCost(profile, 103);
    expect(duplicate).toEqual({ cost: 10, mode: 'repeat' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('unlocks all 105 cards, Rank S, and Binder completion when Sandbox Mode is active', () => {
    const profile = { ...createDefaultProfile(), sandboxUnlockAll: true };
    expect(getEffectiveRank(profile)).toBe('S');
    expect(isBinderComplete(profile)).toBe(true);
    expect(getEffectiveOwnedCount(profile, 100)).toBeGreaterThanOrEqual(6);
  });

  it('protects the last 6 owned cards from Keepsies loss and repairs multi-slot losses without phantom duplicates', () => {
    // Starter profile has 7 cards (1 copy each of 1, 16, 23, 24, 52, 62, 103)
    let profile = createDefaultProfile();
    expect(getTotalOwnedCardCount(profile)).toBe(7);
    expect(canForfeitCardOnKeepsies(profile)).toBe(true);

    // Put 2 broken references in a deck (lost card 103 twice? simulate losing 103 when deck has 103 and after another loss)
    profile = applyMatchOutcomeToProfile(profile, {
      npcId: 'anihal_savalon',
      earnedPoints: 0,
      won: false,
      lostCardId: 103,
    });
    expect(getTotalOwnedCardCount(profile)).toBe(6);
    expect(canForfeitCardOnKeepsies(profile)).toBe(false);

    // Verify every deck has 6 valid cards and never uses more copies than ownedCounts
    for (const d of profile.decks) {
      expect(d.cards).toHaveLength(6);
      const counts: Record<number, number> = {};
      for (const cid of d.cards) {
        counts[cid] = (counts[cid] ?? 0) + 1;
        expect(counts[cid]).toBeLessThanOrEqual(profile.ownedCounts[cid] ?? 0);
      }
    }

    // Losing again at 6 total owned cards protects the remaining 6 cards
    const protectedAfter = applyMatchOutcomeToProfile(profile, {
      npcId: 'anihal_savalon',
      earnedPoints: 0,
      won: false,
      lostCardId: 1,
    });
    expect(protectedAfter.ownedCounts[1]).toBe(1);
    expect(getTotalOwnedCardCount(protectedAfter)).toBe(6);
  });

  it('sanitizes corrupted localStorage saves cleanly without crashing', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () =>
          JSON.stringify({
            points: -50,
            cumulativePoints: 'NaN',
            ownedCounts: { '1': 1, '9999': 5, '16': -3 },
            everCollected: [1, 9999, 'bad'],
            lostCards: [1, 9999],
            decks: [
              { id: 'd_custom', name: '', cards: [9999, 'oops', 1] },
            ],
            activeDeckId: 'nonexistent',
          }),
      },
    });

    const loaded = loadProfile();
    expect(loaded.points).toBe(25);
    expect(loaded.cumulativePoints).toBe(0);
    expect(loaded.rank).toBe('C');
    expect(loaded.ownedCounts[9999]).toBeUndefined();
    expect(getTotalOwnedCardCount(loaded)).toBeGreaterThanOrEqual(6);
    expect(loaded.everCollected).not.toContain(9999);
    expect(loaded.lostCards).not.toContain(1);
    expect(loaded.decks[0].cards).toHaveLength(6);
    expect(loaded.decks[0].cards.every((id) => id >= 1 && id <= 105)).toBe(true);
    expect(loaded.activeDeckId).toBe(loaded.decks[0].id);
  });
});
