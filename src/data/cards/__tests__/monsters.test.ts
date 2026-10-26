import { describe, expect, it } from 'vitest';
import { MONSTER_CARDS } from '../monsters';

describe('MONSTER_CARDS (001-058)', () => {
  it('contains all 58 monster cards in sequential order', () => {
    expect(MONSTER_CARDS).toHaveLength(58);
    MONSTER_CARDS.forEach((card, idx) => {
      expect(card.id).toBe(idx + 1);
      expect(card.code).toBe(String(idx + 1).padStart(3, '0'));
    });
  });

  it('keeps every 4x4 card badge footprint strictly within [0..3, 0..3]', () => {
    for (const card of MONSTER_CARDS) {
      for (const stateName of ['normal', 'reinforced', 'weakened'] as const) {
        const pattern = card[stateName];
        const [ar, ac] = pattern.anchor;
        expect(ar, `${card.code} ${stateName} anchor row`).toBeGreaterThanOrEqual(0);
        expect(ar, `${card.code} ${stateName} anchor row`).toBeLessThanOrEqual(3);
        expect(ac, `${card.code} ${stateName} anchor col`).toBeGreaterThanOrEqual(0);
        expect(ac, `${card.code} ${stateName} anchor col`).toBeLessThanOrEqual(3);

        const seen = new Set<string>([`${ar},${ac}`]);
        for (const [dr, dc] of pattern.secondaries) {
          const sr = ar + dr;
          const sc = ac + dc;
          expect(sr, `${card.code} ${card.name} ${stateName} sec row`).toBeGreaterThanOrEqual(0);
          expect(sr, `${card.code} ${card.name} ${stateName} sec row`).toBeLessThanOrEqual(3);
          expect(sc, `${card.code} ${card.name} ${stateName} sec col`).toBeGreaterThanOrEqual(0);
          expect(sc, `${card.code} ${card.name} ${stateName} sec col`).toBeLessThanOrEqual(3);
          const key = `${sr},${sc}`;
          expect(seen.has(key), `${card.code} ${stateName} duplicate square ${key}`).toBe(false);
          seen.add(key);
        }
      }
    }
  });
});
