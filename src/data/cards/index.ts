import type { BndCard } from '../../types/bnd';
import { MONSTER_CARDS } from './monsters';
import { SPECIAL_CARDS } from './specialCards';

export { MONSTER_CARDS } from './monsters';
export { SPECIAL_CARDS, parseBadgeGrid } from './specialCards';
export { CARD_IMAGE_FILES, getCardImageUrl } from './cardImages';

export const ALL_CARDS: readonly BndCard[] = [...MONSTER_CARDS, ...SPECIAL_CARDS];

const CARD_BY_ID = new Map<number, BndCard>(ALL_CARDS.map((c) => [c.id, c]));

export function getCardById(id: number): BndCard {
  const card = CARD_BY_ID.get(id);
  if (!card) {
    throw new Error(`Unknown B'n'D card id: ${id}`);
  }
  return card;
}

export function getReacquirePt(card: BndCard): number {
  if (card.category === 'Monster') {
    return Math.max(1, Math.floor((card.firstPt * 2) / 3));
  }
  return card.reacquirePt;
}
