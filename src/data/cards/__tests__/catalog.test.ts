import { describe, expect, it } from 'vitest';
import { ALL_CARDS, CARD_IMAGE_FILES, getCardImageUrl, MONSTER_CARDS, SPECIAL_CARDS } from '../index';

describe('Complete 105-Card B\'n\'D Catalog (001-105)', () => {
  it('contains all 105 cards with exact category counts (58 Monsters, 24 Jobs, 23 Characters)', () => {
    expect(ALL_CARDS).toHaveLength(105);
    expect(MONSTER_CARDS).toHaveLength(58);
    expect(SPECIAL_CARDS).toHaveLength(47);

    const jobs = ALL_CARDS.filter((c) => c.category === 'Job');
    const chars = ALL_CARDS.filter((c) => c.category === 'Character');
    const permChars = SPECIAL_CARDS.filter((c) => c.placementType === 'permanent');
    const placedChars = SPECIAL_CARDS.filter((c) => c.category === 'Character' && c.placementType === 'placed');

    expect(jobs).toHaveLength(24);
    expect(chars).toHaveLength(23);
    expect(permChars).toHaveLength(8);
    expect(placedChars).toHaveLength(15);

    ALL_CARDS.forEach((card, idx) => {
      expect(card.id).toBe(idx + 1);
      expect(card.code).toBe(String(idx + 1).padStart(3, '0'));
    });
  });

  it('validates all 291 4x4 badge footprints across Normal, Reinforced, and Weakened states', () => {
    for (const card of ALL_CARDS) {
      if (card.category !== 'Monster' && card.placementType === 'permanent') {
        expect(card.normal).toBeNull();
        expect(card.reinforced).toBeNull();
        expect(card.weakened).toBeNull();
        continue;
      }

      for (const stateName of ['normal', 'reinforced', 'weakened'] as const) {
        const pattern = card[stateName];
        expect(pattern, `${card.code} ${stateName} pattern missing`).not.toBeNull();
        const [ar, ac] = pattern!.anchor;
        expect(ar).toBeGreaterThanOrEqual(0);
        expect(ar).toBeLessThanOrEqual(3);
        expect(ac).toBeGreaterThanOrEqual(0);
        expect(ac).toBeLessThanOrEqual(3);

        const seen = new Set<string>([`${ar},${ac}`]);
        for (const [dr, dc] of pattern!.secondaries) {
          const sr = ar + dr;
          const sc = ac + dc;
          expect(sr, `${card.code} ${card.name} ${stateName} row`).toBeGreaterThanOrEqual(0);
          expect(sr, `${card.code} ${card.name} ${stateName} row`).toBeLessThanOrEqual(3);
          expect(sc, `${card.code} ${card.name} ${stateName} col`).toBeGreaterThanOrEqual(0);
          expect(sc, `${card.code} ${card.name} ${stateName} col`).toBeLessThanOrEqual(3);
          const key = `${sr},${sc}`;
          expect(seen.has(key), `${card.code} ${stateName} duplicate ${key}`).toBe(false);
          seen.add(key);
        }
      }
    }
  });

  it('maps all 105 cards to unique .png image assets (never .svg)', () => {
    const filenames = Object.values(CARD_IMAGE_FILES);
    expect(filenames).toHaveLength(105);
    expect(new Set(filenames).size).toBe(105);

    for (const card of ALL_CARDS) {
      const url = getCardImageUrl(card.id);
      expect(url.includes(`assets/cards/${card.code}-`)).toBe(true);
      expect(url.endsWith('.png')).toBe(true);
    }
  });
});
