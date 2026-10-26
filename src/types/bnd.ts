import type { FootprintPattern, MonsterCardData, MonsterTrait, MonsterTribe } from '../data/cards/monsters';

export type { FootprintPattern, MonsterCardData, MonsterTrait, MonsterTribe };

export type PlayerSide = 'player' | 'opponent';
export type CellOwner = 'neutral' | PlayerSide;
export type CardCategory = 'Monster' | 'Job' | 'Character';
export type FootprintState = 'normal' | 'reinforced' | 'weakened';

export type AbilityFamily =
  | 'Rare Breeds'
  | 'Ill Breeding'
  | 'Reinforce'
  | 'Undermine'
  | 'Co-Opt Card'
  | 'Fortify Position'
  | 'Scorched Earth'
  | 'Stay Hand'
  | 'Cleanse'
  | 'Counter'
  | 'Territorial Gains'
  | 'Brave'
  | 'Default'
  | 'Reversal'
  | "No Man's Land"
  | 'The Long Game';

export type EffectDurationType =
  | 'instant'
  | 'extended_medal'
  | 'permanent_global'
  | 'innate';

export interface SpecialCardData {
  id: number;
  code: string;
  name: string;
  jpName: string;
  category: 'Job' | 'Character';
  /** 'placed' = placed on a Neutral board square; 'permanent' = 0-square Character card used into global slot */
  placementType: 'placed' | 'permanent';
  abilityFamily: AbilityFamily;
  jpAbilityFamily: string;
  effectDuration: EffectDurationType;
  hiddenMedal?: boolean;
  /** True if Bernard (071) treats this card's ability as single-side targeted and inverts its target rather than cancelling & stealing Base */
  singleSideTargeted?: boolean;
  trait: 'none' | 'extra_reinforce' | 'horten_penalty' | 'self_only_13' | 'late_bloomer';
  traitText?: string;
  abilityText: string;
  firstPt: number;
  /** Cost to buy duplicate copies (floor(firstPt / 2)) or re-acquire when lost (floor(firstPt * 2 / 3)) */
  repeatPt: number;
  reacquirePt: number;
  isStarter?: boolean;
  normal: FootprintPattern | null;
  reinforced: FootprintPattern | null;
  weakened: FootprintPattern | null;
  sourceHint: string;
}

export type BndCard = MonsterCardData | SpecialCardData;

export type MatchRuleId =
  | 'no_keepsies'
  | 'wipeout'
  | 'first_past_the_post'
  | 'wraparound';

export interface MatchRuleDef {
  id: MatchRuleId;
  name: string;
  jpName: string;
  multiplier: number;
  description: string;
}

export interface BoardMedal {
  cardId: number;
  /** Who owns the square / medal */
  owner: PlayerSide;
  /** Effective beneficiary of single-side effects (normally === owner, inverted if hit by Bernard 071) */
  beneficiary: PlayerSide;
  hiddenFromOpponent: boolean;
}

export interface BoardCell {
  row: number;
  col: number;
  owner: CellOwner;
  fortified: boolean;
  /** 0 = healthy; 3..1 = poisoned countdown (decrements at end of every single turn/ply; reverts to neutral at 0) */
  poisonTurns: number;
  medal: BoardMedal | null;
  lastPlayedCardId?: number;
}

export interface CardInstance {
  uid: string;
  cardId: number;
}

export interface TempTribeSeal {
  /** Which player is locked out of playing these tribes on their next turn */
  target: PlayerSide;
  tribes: readonly MonsterTribe[];
  sourceCardId: number;
}

export interface PendingExtraPlay {
  side: PlayerSide;
  restriction: 'any' | 'character_only';
  forcedByOpponent: boolean;
  sourceCardId: number;
}

export interface MoveHighlight {
  row: number;
  col: number;
  kind: 'primary' | 'claimed' | 'neutralized' | 'flanked' | 'shield_broken' | 'fortified' | 'poisoned' | 'swapped' | 'stolen';
}

export interface MatchLogEntry {
  id: number;
  turn: number;
  side: PlayerSide | 'system';
  message: string;
}

export interface MatchState {
  board: BoardCell[][];
  firstPlayer: PlayerSide;
  activeTurn: PlayerSide;
  /** Total turns/plies elapsed (starts at 1 for first move) */
  turnNumber: number;
  hands: Record<PlayerSide, CardInstance[]>;
  initialDecks: Record<PlayerSide, number[]>;
  permanentCard: { cardId: number; playedBy: PlayerSide } | null;
  tempSeals: TempTribeSeal[];
  pendingExtraPlay: PendingExtraPlay | null;
  shieldmasterUsed: Record<PlayerSide, boolean>;
  allBinderCollected: boolean;
  matchRules: MatchRuleId[];
  status: 'playing' | 'player_win' | 'opponent_win' | 'draw';
  winReason?: string;
  highlights: MoveHighlight[];
  log: MatchLogEntry[];
  nextLogId: number;
  consecutivePasses: number;
}

export type OpponentRank = 'C' | 'B' | 'A' | 'S';

export interface NpcOpponent {
  id: string;
  name: string;
  jpName: string;
  title: string;
  region: string;
  rank: OpponentRank;
  /** Primary 6-card deck (or Going-First deck for Rank A/S) */
  deckFirst: readonly number[];
  /** Optional Going-Second 6-card deck used by Rank A/S duelists */
  deckSecond?: readonly number[];
  /** Cards available to win from this opponent */
  rewardCards: readonly number[];
  /** Default rules enforced before all reward cards are claimed */
  defaultRules: readonly MatchRuleId[];
  avatarTheme: {
    primary: string;
    accent: string;
    emblem: string;
  };
  quoteIntro: string;
  quoteWin: string;
  quoteLose: string;
}

export interface SavedDeck {
  id: string;
  name: string;
  cards: number[]; // length 6
}

export interface PlayerProfile {
  points: number;
  rank: OpponentRank;
  /** Card IDs currently owned (1..105); count of copies owned */
  ownedCounts: Record<number, number>;
  /** Card IDs unlocked at least once in the Binder (even if currently 0 copies due to Keepsies loss) */
  everCollected: number[];
  /** Sandbox toggle: treats all 105 cards as unlocked & available for deck-building */
  sandboxUnlockAll: boolean;
  decks: SavedDeck[];
  activeDeckId: string;
  /** Wins per opponent ID */
  npcWins: Record<string, number>;
  /** Claimed reward card IDs per opponent ID */
  npcClaimedCards: Record<string, number[]>;
}
