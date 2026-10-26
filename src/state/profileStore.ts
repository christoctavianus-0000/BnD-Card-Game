import { ALL_CARDS, getCardById, getReacquirePt } from '../data/cards';
import { INITIAL_UNLOCKED_CARD_IDS, STARTER_DECK_IDS } from '../data/opponents';
import { getRankForCumulativePoints } from '../engine/rules';
import type { OpponentRank, PlayerProfile, SavedDeck } from '../types/bnd';

const STORAGE_KEY = 'bnd_bravely_default_2_profile_v1';

export interface ExtendedPlayerProfile extends PlayerProfile {
  cumulativePoints: number;
  lostCards: number[];
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
    const parsed = JSON.parse(raw) as Partial<ExtendedPlayerProfile>;
    const fallback = createDefaultProfile();
    return {
      ...fallback,
      ...parsed,
      ownedCounts: { ...fallback.ownedCounts, ...(parsed.ownedCounts ?? {}) },
      everCollected: Array.isArray(parsed.everCollected)
        ? parsed.everCollected
        : fallback.everCollected,
      lostCards: Array.isArray(parsed.lostCards) ? parsed.lostCards : [],
      decks: Array.isArray(parsed.decks) && parsed.decks.length > 0 ? parsed.decks : fallback.decks,
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

  if (params.lostCardId !== undefined && !prev.sandboxUnlockAll) {
    const cid = params.lostCardId;
    const cur = ownedCounts[cid] ?? 0;
    if (cur > 0) {
      ownedCounts[cid] = cur - 1;
      if (ownedCounts[cid] === 0 && !lostCards.includes(cid)) {
        lostCards = [...lostCards, cid];
      }
      // Ensure saved decks don't reference more copies of cid than now owned
      const remaining = ownedCounts[cid];
      decks = decks.map((deck) => {
        let used = 0;
        const nextCards = deck.cards.map((id) => {
          if (id !== cid) return id;
          used += 1;
          if (used <= remaining) return id;
          // Substitute with any available owned card so deck stays at 6 cards
          const fallbackId =
            Object.entries(ownedCounts)
              .map(([k, cnt]) => ({ id: Number(k), cnt }))
              .find((entry) => entry.cnt > deck.cards.filter((x) => x === entry.id).length)?.id ?? 1;
          return fallbackId;
        });
        return { ...deck, cards: nextCards };
      });
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
