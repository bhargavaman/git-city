import { SIDE_MIN_SCORERS } from "./play-rules";
import { sideDays, sideScore, type PlayEntry, type PlaySideResult } from "./play-score";
import { SIDES, type Side } from "./battle-rules";

// ─── Claude vs Codex sides from play points (pure) ──────────
// The live week comes from the board's entries. A closed week comes from the
// war the Monday close froze in town_play_weeks. Team categories are decided
// at the close, so a live side has no bonus yet and its score is its per
// player. Client-safe: the poster imports the score lines.

export interface BattleCoder {
  login: string;
  avatar_url: string | null;
  /** Points this week (daily caps and the 2x activity applied, no prize bonus). */
  total: number;
}

export interface SideLoad {
  /** Average points of the side's counted players who scored. Null under 3. */
  perPlayer: number | null;
  scorers: number;
  /** Team category points (+TEAM_BONUS each). 0 until the close. */
  bonus: number;
  /** perPlayer + bonus. Null when perPlayer is null. */
  score: number | null;
  /** Per player by day, Mon..Sun (sideDays over PlayEntry.daily). */
  days: number[];
  top: BattleCoder[];
}

export const TOP_PLAYERS = 3;

/** The side's counted players: alts never move a side's score. */
const counted = (entries: PlayEntry[], side: Side) =>
  entries.filter((e) => e.side === side && e.counted);

/** The side's best counted scorers, in points order (the standings' tie-break holds on equal points). */
export function topPlayers(entries: PlayEntry[], side: Side): BattleCoder[] {
  return counted(entries, side)
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_PLAYERS)
    .map((e) => ({ login: e.login, avatar_url: e.avatar_url, total: e.total }));
}

/** This week so far, from the live board. */
export function liveSide(entries: PlayEntry[], side: Side): SideLoad {
  const totals = counted(entries, side).map((e) => e.total);
  const s = sideScore(totals);
  const perPlayer = s?.perPlayer ?? null;
  const scorers = s?.scorers ?? totals.filter((t) => t > 0).length;
  return {
    perPlayer,
    scorers,
    bonus: 0,
    score: perPlayer,
    days: sideDays(entries, side),
    top: topPlayers(entries, side),
  };
}

/** A closed week: the score as the close froze it, the days and top from its standings. */
export function closedSide(war: PlaySideResult, entries: PlayEntry[], side: Side): SideLoad {
  return {
    perPlayer: war.perPlayer,
    scorers: war.scorers,
    bonus: war.bonus,
    score: war.score,
    days: sideDays(entries, side),
    top: topPlayers(entries, side),
  };
}

export interface ScoreView {
  showing: "live" | "result";
  sides: Record<Side, { score: number | null }>;
}

export interface LastWeekView {
  number: number;
  winner: Side | null;
  claude: number | null;
  codex: number | null;
}

/** Claude's share of the tug bar. */
export function scoreShare(b: ScoreView): number {
  const [a, c] = [b.sides.claude.score ?? 0, b.sides.codex.score ?? 0];
  return a + c === 0 ? 0.5 : a / (a + c);
}

/** "Claude leads · 105 vs 95 per player", or who can't score yet. */
export function battleLead(b: ScoreView, names: [string, string]): string {
  const [a, c] = [b.sides.claude.score, b.sides.codex.score];
  if (a === null && c === null) return `Nobody has ${SIDE_MIN_SCORERS} players yet`;
  if (a === null) return `${names[0]} needs ${SIDE_MIN_SCORERS} players to score`;
  if (c === null) return `${names[1]} needs ${SIDE_MIN_SCORERS} players to score`;
  if (a === c) return `Dead even · ${a} per player`;
  const [top, low] = a > c ? [0, 1] : [1, 0];
  const n = [a, c];
  const verb = b.showing === "result" ? "won" : "leads";
  return `${names[top]} ${verb} · ${n[top]} vs ${n[low]} per player`;
}

/** "Claude won week 1 · 120 vs 95 per player". */
export function resultLine(w: LastWeekView | null, names: [string, string]): string | null {
  if (!w) return null;
  const score = (n: number | null) => (n === null ? "–" : String(n));
  // The dot stays on the first line when it wraps.
  if (w.winner === null)
    return `Week ${w.number} was a tie\u00a0· ${score(w.claude)} vs ${score(w.codex)} per player`;
  const i = SIDES.indexOf(w.winner);
  const [hi, lo] = i === 0 ? [w.claude, w.codex] : [w.codex, w.claude];
  return `${names[i]} won week ${w.number}\u00a0· ${score(hi)} vs ${score(lo)} per player`;
}
