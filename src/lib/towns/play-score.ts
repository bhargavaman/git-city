import type { Side } from "./battle-rules";
import { townDays } from "@/lib/leagues/scoring";
import {
  ACCOUNT_CUTOFF,
  CHECK_TOP,
  GROWTH_BY,
  MOST_VISITED_MIN,
  PRIZE_WINNERS,
  SIDE_MIN_SCORERS,
  TEAM_BONUS,
  smallerSideBonus,
  type FeaturedActivity,
} from "./play-rules";

// ─── Towns play scoring (pure) ──────────────────────────────
// One weekly count decides both the war and the prize. The SQL
// (play_day_points) caps each activity per UTC day. Here the week's 2×
// activity is applied (2× points with a 2× cap is exactly 2 × the capped
// value), and then come the alt checks, the prize-only smaller-side bonus,
// the side averages, the team categories, the tie-break and the winners.

const DAY_MS = 86_400_000;

function utcDay(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** One player's capped points on one UTC day, as play_day_points returns them. */
export interface PlayDayRow {
  developer_id: number;
  day: string;
  floors: number;
  raids: number;
  visits: number;
  kudos: number;
  code: number;
}

/** The day's points, with the featured activity doubled. Coding is never featured. */
export function dayTotal(row: PlayDayRow, featured: FeaturedActivity | null): number {
  const base = row.floors + row.raids + row.visits + row.kudos + row.code;
  return featured ? base + row[featured] : base;
}

/** An active member of any town. `side` is null outside the two war towns. */
export interface PlayPlayer {
  developer_id: number;
  login: string;
  avatar_url: string | null;
  side: Side | null;
  claimed_at: string | null;
  account_created_at: string | null;
  claimed_by: string | null;
  seen: string[];
}

export interface SideBonus {
  side: Side;
  pct: number;
}

export interface PlayEntry {
  developer_id: number;
  login: string;
  avatar_url: string | null;
  side: Side | null;
  /** The week's points with the 2× activity. The war uses this. */
  total: number;
  /** `total` plus the smaller-side bonus, rounded down. The prize ranks by this. */
  prize: number;
  nonCoding: number;
  /** Days with 1+ point. */
  days: number;
  /** Points per day, Mon..Sun. */
  daily: number[];
  /** Passes the alt checks: counts for its side, for the categories and for the prize. */
  counted: boolean;
  /** Counted and scored 1+ point from something other than coding. */
  eligible: boolean;
  seen: string[];
  claimed_at: string | null;
  rank: number;
}

/**
 * The alt checks: claimed before Monday 00:00 UTC of the week, a GitHub
 * account created before ACCOUNT_CUTOFF, and one developer per auth user
 * (the one with the most points, then the lower id).
 */
export function countedIds(players: PlayPlayer[], totals: Map<number, number>, weekStartDay: string): Set<number> {
  const start = utcDay(weekStartDay);
  const cutoff = utcDay(ACCOUNT_CUTOFF);
  const out = new Set<number>();
  const byUser = new Map<string, PlayPlayer>();
  const pts = (p: PlayPlayer) => totals.get(p.developer_id) ?? 0;
  for (const p of players) {
    if (!p.claimed_at || Date.parse(p.claimed_at) >= start) continue;
    if (!p.account_created_at || Date.parse(p.account_created_at) >= cutoff) continue;
    if (!p.claimed_by) {
      out.add(p.developer_id);
      continue;
    }
    const kept = byUser.get(p.claimed_by);
    const wins = !kept || pts(p) > pts(kept) || (pts(p) === pts(kept) && p.developer_id < kept.developer_id);
    if (wins) byUser.set(p.claimed_by, p);
  }
  for (const p of byUser.values()) out.add(p.developer_id);
  return out;
}

function claimedMs(e: PlayEntry): number {
  return e.claimed_at ? Date.parse(e.claimed_at) : Number.POSITIVE_INFINITY;
}

/** Prize points, then more days played, then the earlier claim (null last), then the lower id. */
function byPrize(a: PlayEntry, b: PlayEntry): number {
  return b.prize - a.prize || b.days - a.days || claimedMs(a) - claimedMs(b) || a.developer_id - b.developer_id;
}

/** Every player with 1+ point this week, ranked for the prize. */
export function rankPlayers(
  players: PlayPlayer[],
  rows: PlayDayRow[],
  opts: { weekStart: string; featured: FeaturedActivity | null; bonus: SideBonus | null },
): PlayEntry[] {
  const start = utcDay(opts.weekStart);
  const acc = new Map<number, { daily: number[]; code: number }>();
  for (const r of rows) {
    const i = Math.round((utcDay(r.day) - start) / DAY_MS);
    if (i < 0 || i > 6) continue;
    const a = acc.get(r.developer_id) ?? { daily: [0, 0, 0, 0, 0, 0, 0], code: 0 };
    a.daily[i] += dayTotal(r, opts.featured);
    a.code += r.code;
    acc.set(r.developer_id, a);
  }
  const totals = new Map<number, number>();
  for (const [id, a] of acc) totals.set(id, a.daily.reduce((s, n) => s + n, 0));
  const counted = countedIds(players, totals, opts.weekStart);

  const entries: PlayEntry[] = [];
  for (const p of players) {
    const a = acc.get(p.developer_id);
    const total = totals.get(p.developer_id) ?? 0;
    if (!a || total <= 0) continue;
    const pct = opts.bonus && p.side === opts.bonus.side ? opts.bonus.pct : 0;
    const nonCoding = total - a.code;
    const isCounted = counted.has(p.developer_id);
    entries.push({
      developer_id: p.developer_id,
      login: p.login,
      avatar_url: p.avatar_url,
      side: p.side,
      total,
      prize: total + Math.floor((total * pct) / 100),
      nonCoding,
      days: a.daily.filter((n) => n > 0).length,
      daily: a.daily,
      counted: isCounted,
      eligible: isCounted && nonCoding > 0,
      seen: p.seen,
      claimed_at: p.claimed_at,
      rank: 0,
    });
  }
  entries.sort(byPrize);
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}

/** A side's average over the players who scored, rounded. Null under SIDE_MIN_SCORERS. */
export function sideScore(totals: number[]): { perPlayer: number; scorers: number } | null {
  const scored = totals.filter((t) => t > 0);
  if (scored.length < SIDE_MIN_SCORERS) return null;
  const sum = scored.reduce((a, b) => a + b, 0);
  return { perPlayer: Math.round(sum / scored.length), scorers: scored.length };
}

/** The side with the higher count. A tie, or a leader under `min`, goes to nobody. */
export function categoryWinner(a: number, b: number, min = 0): Side | null {
  if (a === b) return null;
  const leader: Side = a > b ? "claude" : "codex";
  return Math.max(a, b) >= min ? leader : null;
}

/** "Grew the most": raw new members, or new members per member at week start (Q1). */
export function growthWinner(
  growth: Record<Side, number>,
  sizes: Record<Side, number>,
  mode: "count" | "share",
): Side | null {
  if (mode === "count") return categoryWinner(growth.claude, growth.codex);
  const share = (s: Side) => growth[s] / Math.max(1, sizes[s]);
  return categoryWinner(share("claude"), share("codex"));
}

export interface CategoryCount {
  claude: number;
  codex: number;
  winner: Side | null;
}

export interface PlaySideResult {
  /** Null under SIDE_MIN_SCORERS counted scorers. */
  perPlayer: number | null;
  scorers: number;
  /** TEAM_BONUS per category won. */
  bonus: number;
  /** perPlayer + bonus. Null with no perPlayer. */
  score: number | null;
}

export interface PlayWar {
  claude: PlaySideResult;
  codex: PlaySideResult;
  growth: CategoryCount;
  visits: CategoryCount & { unique: Record<Side, number> };
  winner: Side | null;
}

/** The close's category counts (play-load.ts loadCategories). */
export interface PlayCategories {
  /** Eligible new members this week. */
  growth: Record<Side, number>;
  /** Counted side members at week start (for share mode). */
  sizes: Record<Side, number>;
  /** Eligible visitor-days from players on neither war side. */
  visitDays: Record<Side, number>;
  /** Unique eligible visitors behind those visit-days. */
  uniqueVisitors: Record<Side, number>;
}

/** Higher score wins. A tie or two nulls go to nobody; a single null loses. */
export function warWinner(claude: number | null, codex: number | null): Side | null {
  if (claude === null && codex === null) return null;
  if (codex === null) return "claude";
  if (claude === null) return "codex";
  if (claude === codex) return null;
  return claude > codex ? "claude" : "codex";
}

/**
 * The week's war. It uses only counted entries and their `total`; the
 * prize bonus never touches it. A category won by a side with no score
 * is void.
 */
export function buildWar(entries: PlayEntry[], cats: PlayCategories): PlayWar {
  const totals: Record<Side, number[]> = { claude: [], codex: [] };
  for (const e of entries) if (e.counted && e.side) totals[e.side].push(e.total);
  const base = { claude: sideScore(totals.claude), codex: sideScore(totals.codex) };
  const live = (w: Side | null): Side | null => (w && base[w] ? w : null);

  const growth = live(growthWinner(cats.growth, cats.sizes, GROWTH_BY));
  const visitLeader = categoryWinner(cats.visitDays.claude, cats.visitDays.codex);
  const visits = live(visitLeader && cats.uniqueVisitors[visitLeader] >= MOST_VISITED_MIN ? visitLeader : null);

  const side = (s: Side): PlaySideResult => {
    const sc = base[s];
    const bonus = sc ? TEAM_BONUS * [growth, visits].filter((w) => w === s).length : 0;
    return {
      perPlayer: sc ? sc.perPlayer : null,
      scorers: totals[s].filter((t) => t > 0).length,
      bonus,
      score: sc ? sc.perPlayer + bonus : null,
    };
  };
  const claude = side("claude");
  const codex = side("codex");
  return {
    claude,
    codex,
    growth: { claude: cats.growth.claude, codex: cats.growth.codex, winner: growth },
    visits: { claude: cats.visitDays.claude, codex: cats.visitDays.codex, winner: visits, unique: cats.uniqueVisitors },
    winner: warWinner(claude.score, codex.score),
  };
}

/** Counted members of each war side as of `beforeDay` 00:00 UTC (the new week's start). */
export function sideSizes(players: PlayPlayer[], beforeDay: string): Record<Side, number> {
  const ids = countedIds(players, new Map(), beforeDay);
  const out: Record<Side, number> = { claude: 0, codex: 0 };
  for (const p of players) if (p.side && ids.has(p.developer_id)) out[p.side]++;
  return out;
}

/** The smaller side's prize bonus for the week that opens, or null when it is 0. */
export function nextBonus(sizes: Record<Side, number>): SideBonus | null {
  if (sizes.claude === sizes.codex) return null;
  const small: Side = sizes.claude < sizes.codex ? "claude" : "codex";
  const big = Math.max(sizes.claude, sizes.codex);
  const pct = smallerSideBonus(big, sizes[small]);
  return pct > 0 ? { side: small, pct } : null;
}

/**
 * The week's prize winners from ranked entries: eligible, not excluded by
 * Sam's check, not a past winner when one prize per season is on, and
 * within the top CHECK_TOP not sharing a seen hash with a winner already
 * picked.
 */
export function pickWinners(
  entries: PlayEntry[],
  opts: { excluded: string[]; pastWinners: string[]; onePrize: boolean },
): PlayEntry[] {
  const excluded = new Set(opts.excluded.map((l) => l.toLowerCase()));
  const past = new Set(opts.pastWinners.map((l) => l.toLowerCase()));
  const picked: PlayEntry[] = [];
  for (const e of entries) {
    if (picked.length >= PRIZE_WINNERS) break;
    const login = e.login.toLowerCase();
    if (!e.eligible || excluded.has(login)) continue;
    if (opts.onePrize && past.has(login)) continue;
    const sharesDevice =
      e.rank <= CHECK_TOP && picked.some((w) => w.rank <= CHECK_TOP && w.seen.some((h) => e.seen.includes(h)));
    if (sharesDevice) continue;
    picked.push(e);
  }
  return picked;
}

/** A side's points per day, Mon..Sun, averaged over its counted scorers (the poster's day winners). */
export function sideDays(entries: PlayEntry[], side: Side): number[] {
  return townDays(entries.filter((e) => e.counted && e.side === side).map((e) => e.daily));
}

/** One row of town_play_weeks (migration 167), as the close writes it and the readers parse it. */
export interface PlayWeekRow {
  week_start: string;
  standings: PlayEntry[];
  war: PlayWar;
  featured: FeaturedActivity | null;
  /** The bonus that applied during this row's own week. */
  bonus_side: Side | null;
  bonus_pct: number;
  /** The bonus for the week that opened when this row closed. */
  next_bonus: SideBonus | null;
  excluded: string[];
  /** Logins, written once by the publish route. */
  winners: string[] | null;
  published_at: string | null;
}
