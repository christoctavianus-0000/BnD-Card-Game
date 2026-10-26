import type { MatchRuleDef, MatchRuleId, OpponentRank } from '../types/bnd';

export const MATCH_RULES: readonly MatchRuleDef[] = [
  {
    id: 'no_keepsies',
    name: 'No Keepsies',
    jpName: '喪失なし',
    multiplier: 0.8,
    description: 'Disables card loss on defeat or draw (0.80× Points). Default rule for Rank C duelists.',
  },
  {
    id: 'wipeout',
    name: 'Wipeout',
    jpName: 'キル＆デス',
    multiplier: 1.1,
    description: 'From Turn 5 onward, reducing the opponent to 0 controlled squares triggers an instant win (1.10× Points).',
  },
  {
    id: 'first_past_the_post',
    name: 'First Past the Post',
    jpName: 'ゴールライン',
    multiplier: 1.2,
    description: 'The first player to control 15 or more squares immediately wins the match (1.20× Points).',
  },
  {
    id: 'wraparound',
    name: 'Wraparound',
    jpName: 'ループ',
    multiplier: 1.4,
    description: 'Secondary squares extending outside the 5×5 board wrap around to the opposite edge (1.40× Points).',
  },
];

export const RANK_MULTIPLIERS: Record<OpponentRank, number> = {
  C: 1.5,
  B: 1.7,
  A: 2.0,
  S: 2.5,
};

export const RANK_THRESHOLDS: Record<OpponentRank, number> = {
  C: 0,
  B: 200,
  A: 700,
  S: 1500,
};

const RULE_MAP = new Map<MatchRuleId, MatchRuleDef>(MATCH_RULES.map((r) => [r.id, r]));

export function getMatchRuleDef(id: MatchRuleId): MatchRuleDef {
  const def = RULE_MAP.get(id);
  if (!def) throw new Error(`Unknown match rule: ${id}`);
  return def;
}

export function calculateRuleMultiplier(rules: readonly MatchRuleId[]): number {
  let mult = 1.0;
  for (const r of rules) {
    mult *= getMatchRuleDef(r).multiplier;
  }
  return mult;
}

export function getRankForCumulativePoints(cumulativePoints: number): OpponentRank {
  if (cumulativePoints >= RANK_THRESHOLDS.S) return 'S';
  if (cumulativePoints >= RANK_THRESHOLDS.A) return 'A';
  if (cumulativePoints >= RANK_THRESHOLDS.B) return 'B';
  return 'C';
}

export function canChallengeRank(playerRank: OpponentRank, targetRank: OpponentRank): boolean {
  const order: Record<OpponentRank, number> = { C: 0, B: 1, A: 2, S: 3 };
  return order[playerRank] >= order[targetRank];
}

/**
 * Exact BD2 post-match B'n'D Point calculation:
 * Points = floor(PlayerSquares * RankMultiplier * RuleMultipliers) on an outright Win (0 on Loss/Draw).
 */
export function calculateMatchPoints(params: {
  outcome: 'player_win' | 'opponent_win' | 'draw';
  playerScore: number;
  opponentRank: OpponentRank;
  rules: readonly MatchRuleId[];
}): number {
  const { outcome, playerScore, opponentRank, rules } = params;
  if (outcome !== 'player_win') {
    return 0;
  }

  const rankMult = RANK_MULTIPLIERS[opponentRank];
  const ruleMult = calculateRuleMultiplier(rules);
  // Add tiny epsilon before floor to prevent IEEE-754 float issues like 15 * 2.5 * 1.4 * 1.2 = 62.99999999999999
  return Math.max(1, Math.floor(playerScore * rankMult * ruleMult + 1e-9));
}
