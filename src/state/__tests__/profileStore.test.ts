import { describe, expect, it } from 'vitest';
import {
  applyMatchOutcomeToProfile,
  createDefaultProfile,
  getCardPurchaseCost,
  getEffectiveOwnedCount,
  getEffectiveRank,
  grantOrBuyCard,
  isBinderComplete,
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

  it('unlocks all 105 cards, Rank S, and Binder completion when Sandbox Mode is active', () => {
    const profile = { ...createDefaultProfile(), sandboxUnlockAll: true };
    expect(getEffectiveRank(profile)).toBe('S');
    expect(isBinderComplete(profile)).toBe(true);
    expect(getEffectiveOwnedCount(profile, 100)).toBeGreaterThanOrEqual(6);
  });
});
