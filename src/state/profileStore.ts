import { ALL_CARDS, getCardById, getReacquirePt } from '../data/cards';
import { INITIAL_UNLOCKED_CARD_IDS, STARTER_DECK_IDS } from '../data/opponents';
import { getRankForCumulativePoints } from '../engine/rules';
import type { OpponentRank, PlayerProfile, SavedDeck } from '../types/bnd';

const STORAGE_KEY = 'bnd_bravely_default_2_profile_v1';
const VALID_CARD_IDS = new Set<number>(ALL_CARDS.map((c) => c.id));

export interface ExtendedPlayerProfile extends PlayerProfile {
  cumulativePoints: number;
  lostCards: number[];
}

export function getTotalOwnedCardCount(
  profile: Pick<ExtendedPlayerProfile, 'ownedCounts'>
): number {
  let total = 0;
  for (const [rawId, count] of Object.entries(profile.ownedCounts)) {
    const id = Number(rawId);
    if (!VALID_CARD_IDS.has(id)) continue;
    if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
      total += Math.floor(count);
    }
  }
  return total;
}

export function canForfeitCardOnKeepsies(profile: ExtendedPlayerProfile): boolean {
  if (profile.sandboxUnlockAll) return false;
  return getTotalOwnedCardCount(profile) > 6;
}

function repairDeckCards(
  rawCards: readonly unknown[],
  ownedCounts: Record<number, number>
): number[] {
  const kept: (number | null)[] = new Array(6).fill(null);
  const usedCounts: Record<number, number> = {};

  for (let i = 0; i < 6; i++) {
    const rawId = rawCards[i];
    const id =
      typeof rawId === 'number' && Number.isInteger(rawId) && VALID_CARD_IDS.has(rawId)
        ? rawId
        : null;
    if (id !== null && (usedCounts[id] ?? 0) < (ownedCounts[id] ?? 0)) {
      kept[i] = id;
      usedCounts[id] = (usedCounts[id] ?? 0) + 1;
    }
  }

  const sortedOwnedIds = Object.keys(ownedCounts)
    .map(Number)
    .filter((id) => VALID_CARD_IDS.has(id) && (ownedCounts[id] ?? 0) > 0)
    .sort((a, b) => a - b);

  for (let i = 0; i < 6; i++) {
    if (kept[i] !== null) continue;
    const replacement = sortedOwnedIds.find(
      (id) => (usedCounts[id] ?? 0) < (ownedCounts[id] ?? 0)
    );
    if (replacement !== undefined) {
      kept[i] = replacement;
      usedCounts[replacement] = (usedCounts[replacement] ?? 0) + 1;
    } else {
      kept[i] = STARTER_DECK_IDS[i] ?? 1;
    }
  }

  return kept as number[];
}

function sanitizeCardIdList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  for (const item of raw) {
    if (typeof item === 'number' && Number.isInteger(item) && VALID_CARD_IDS.has(item)) {
      seen.add(item);
    }
  }
  return [...seen];
}

export function createDefaultProfile(): ExtendedPlayerProfile {
  const ownedCounts: Record<number, number> = {};
  for (const id of INITIAL_UNLOCKED_CARD_IDS) {
    ownedCounts[id] = 1;
  }

  const decks: SavedDeck[] = [
    {
      id: 'deck_1',
      name: 'Savalon Starter',
      cards: [...STARTER_DECK_IDS],
    },
    {
      id: 'deck_2',
      name: 'Orpheus Counter',
      cards: [62, 16, 23, 24, 52, 103],
    },
    {
      id: 'deck_3',
      name: 'Custom Deck 3',
      cards: [...STARTER_DECK_IDS],
    },
    {
      id: 'deck_4',
      name: 'Custom Deck 4',
      cards: [...STARTER_DECK_IDS],
    },
    {
      id: 'deck_5',
      name: 'Custom Deck 5',
      cards: [...STARTER_DECK_IDS],
    },
  ];

  return {
    points: 25,
    cumulativePoints: 0,
    rank: 'C',
    ownedCounts,
    everCollected: [...INITIAL_UNLOCKED_CARD_IDS],
    lostCards: [],
    sandboxUnlockAll: false,
    decks,
    activeDeckId: 'deck_1',
    npcWins: {},
    npcClaimedCards: {},
  };
}

export function loadProfile(): ExtendedPlayerProfile {
  if (typeof window === 'undefined') return createDefaultProfile();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProfile();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return createDefaultProfile();
    }

    const record = parsed as Record<string, unknown>;
    const fallback = createDefaultProfile();

    const sanitizedOwned: Record<number, number> = {};
    if (
      record.ownedCounts &&
      typeof record.ownedCounts === 'object' &&
      !Array.isArray(record.ownedCounts)
    ) {
      for (const [k, v] of Object.entries(record.ownedCounts as Record<string, unknown>)) {
        const id = Number(k);
        if (
          Number.isInteger(id) &&
          VALID_CARD_IDS.has(id) &&
          typeof v === 'number' &&
          Number.isFinite(v) &&
          v >= 0
        ) {
          sanitizedOwned[id] = Math.floor(v);
        }
      }
    }

    const ownedCounts =
      getTotalOwnedCardCount({ ownedCounts: sanitizedOwned }) >= 6
        ? sanitizedOwned
        : fallback.ownedCounts;

    const everSet = new Set<number>([
      ...INITIAL_UNLOCKED_CARD_IDS,
      ...sanitizeCardIdList(record.everCollected),
    ]);
    for (const [rawId, cnt] of Object.entries(ownedCounts)) {
      if (cnt > 0) everSet.add(Number(rawId));
    }
    const everCollected = [...everSet].sort((a, b) => a - b);

    const lostCards = sanitizeCardIdList(record.lostCards).filter(
      (id) => (ownedCounts[id] ?? 0) === 0
    );

    const rawDecks = Array.isArray(record.decks) ? record.decks : [];
    const seenDeckIds = new Set<string>();
    const sanitizedDecks: SavedDeck[] = [];
    for (let i = 0; i < rawDecks.length; i++) {
      const item = rawDecks[i];
      if (!item || typeof item !== 'object') continue;
      const d = item as Record<string, unknown>;
      const rawId = typeof d.id === 'string' && d.id.trim() ? d.id.trim() : `deck_${i + 1}`;
      const id = seenDeckIds.has(rawId) ? `deck_${i + 1}` : rawId;
      seenDeckIds.add(id);
      const name =
        typeof d.name === 'string' && d.name.trim()
          ? d.name.trim().slice(0, 24)
          : `Custom Deck ${i + 1}`;
      const cards = repairDeckCards(Array.isArray(d.cards) ? d.cards : [], ownedCounts);
      sanitizedDecks.push({ id, name, cards });
    }
    const decks = sanitizedDecks.length > 0 ? sanitizedDecks : fallback.decks;

    const activeDeckId =
      typeof record.activeDeckId === 'string' && decks.some((d) => d.id === record.activeDeckId)
        ? record.activeDeckId
        : decks[0].id;

    const points =
      typeof record.points === 'number' && Number.isFinite(record.points) && record.points >= 0
        ? Math.floor(record.points)
        : fallback.points;

    const cumulativePoints =
      typeof record.cumulativePoints === 'number' &&
      Number.isFinite(record.cumulativePoints) &&
      record.cumulativePoints >= 0
        ? Math.floor(record.cumulativePoints)
        : fallback.cumulativePoints;

    const npcWins: Record<string, number> = {};
    if (
      record.npcWins &&
      typeof record.npcWins === 'object' &&
      !Array.isArray(record.npcWins)
    ) {
      for (const [k, v] of Object.entries(record.npcWins as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
          npcWins[k] = Math.floor(v);
        }
      }
    }

    const npcClaimedCards: Record<string, number[]> = {};
    if (
      record.npcClaimedCards &&
      typeof record.npcClaimedCards === 'object' &&
      !Array.isArray(record.npcClaimedCards)
    ) {
      for (const [k, v] of Object.entries(record.npcClaimedCards as Record<string, unknown>)) {
        npcClaimedCards[k] = sanitizeCardIdList(v);
      }
    }

    return {
      points,
      cumulativePoints,
      rank: getRankForCumulativePoints(cumulativePoints),
      ownedCounts,
      everCollected,
      lostCards,
      sandboxUnlockAll: Boolean(record.sandboxUnlockAll),
      decks,
      activeDeckId,
      npcWins,
      npcClaimedCards,
    };
  } catch {
    return createDefaultProfile();
  }
}

export function saveProfile(profile: ExtendedPlayerProfile): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage quota errors
  }
}

export function getEffectiveOwnedCount(profile: ExtendedPlayerProfile, cardId: number): number {
  if (profile.sandboxUnlockAll) {
    return Math.max(6, profile.ownedCounts[cardId] ?? 0);
  }
  return profile.ownedCounts[cardId] ?? 0;
}

export function isBinderComplete(profile: ExtendedPlayerProfile): boolean {
  if (profile.sandboxUnlockAll) return true;
  return profile.everCollected.length >= ALL_CARDS.length;
}

export function getEffectiveRank(profile: ExtendedPlayerProfile): OpponentRank {
  if (profile.sandboxUnlockAll) return 'S';
  return getRankForCumulativePoints(profile.cumulativePoints);
}

export function getCardPurchaseCost(
  profile: ExtendedPlayerProfile,
  cardId: number
): { cost: number; mode: 'first' | 'repeat' | 'reacquire' } {
  const card = getCardById(cardId);
  if (profile.lostCards.includes(cardId) && (profile.ownedCounts[cardId] ?? 0) === 0) {
    return { cost: getReacquirePt(card), mode: 'reacquire' };
  }
  if (profile.everCollected.includes(cardId)) {
    return { cost: card.repeatPt, mode: 'repeat' };
  }
  return { cost: card.firstPt, mode: 'first' };
}

export function grantOrBuyCard(
  prev: ExtendedPlayerProfile,
  cardId: number,
  ptCost: number,
  npcId?: string
): ExtendedPlayerProfile {
  if (prev.points < ptCost) return prev;
  const currentOwned = prev.ownedCounts[cardId] ?? 0;
  const everCollected = prev.everCollected.includes(cardId)
    ? prev.everCollected
    : [...prev.everCollected, cardId].sort((a, b) => a - b);

  const lostCards = prev.lostCards.filter((id) => id !== cardId);
  const npcClaimedCards = { ...prev.npcClaimedCards };
  if (npcId) {
    const existing = npcClaimedCards[npcId] ?? [];
    if (!existing.includes(cardId)) {
      npcClaimedCards[npcId] = [...existing, cardId];
    }
  }

  return {
    ...prev,
    points: prev.points - ptCost,
    ownedCounts: {
      ...prev.ownedCounts,
      [cardId]: currentOwned + 1,
    },
    everCollected,
    lostCards,
    npcClaimedCards,
  };
}

export function applyMatchOutcomeToProfile(
  prev: ExtendedPlayerProfile,
  params: {
    npcId: string;
    earnedPoints: number;
    won: boolean;
    lostCardId?: number;
  }
): ExtendedPlayerProfile {
  const nextPoints = prev.points + params.earnedPoints;
  const nextCumulative = prev.cumulativePoints + params.earnedPoints;
  const nextRank = getRankForCumulativePoints(nextCumulative);

  const npcWins = { ...prev.npcWins };
  if (params.won) {
    npcWins[params.npcId] = (npcWins[params.npcId] ?? 0) + 1;
  }

  const ownedCounts = { ...prev.ownedCounts };
  let lostCards = [...prev.lostCards];
  let decks = prev.decks.map((d) => ({ ...d, cards: [...d.cards] }));

  if (params.lostCardId !== undefined && canForfeitCardOnKeepsies(prev)) {
    const cid = params.lostCardId;
    const cur = ownedCounts[cid] ?? 0;
    if (cur > 0) {
      ownedCounts[cid] = cur - 1;
      if (ownedCounts[cid] === 0 && !lostCards.includes(cid)) {
        lostCards = [...lostCards, cid];
      }
      // Ensure every saved deck stays valid with 6 owned cards and no phantom duplicates
      decks = decks.map((deck) => ({
        ...deck,
        cards: repairDeckCards(deck.cards, ownedCounts),
      }));
    }
  }

  return {
    ...prev,
    points: nextPoints,
    cumulativePoints: nextCumulative,
    rank: nextRank,
    ownedCounts,
    lostCards,
    decks,
    npcWins,
  };
}
