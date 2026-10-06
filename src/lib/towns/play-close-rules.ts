import { isoDay } from "@/lib/leagues/scoring";
import { SIDES, type Side } from "./battle-rules";

// Pure helpers for the Monday play close (play.ts). No DB here, so vitest
// can load them; play-load.ts does the reads and feeds them in.

const DAY_MS = 86_400_000;

/** The Monday `weeks` weeks after (or before, when negative) `day`. */
export function shiftWeek(day: string, weeks: number): string {
  return isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + weeks * 7 * DAY_MS));
}

/** Sunday of the week starting `weekStartDay`, the inclusive end for play_day_points. */
export function lastDay(weekStartDay: string): string {
  return isoDay(new Date(Date.parse(`${weekStartDay}T00:00:00Z`) + 6 * DAY_MS));
}

/** League id of each war town (null when the town doesn't exist, e.g. on staging). */
export type SideIds = Record<Side, string | null>;

export interface MemberHistoryRow {
  developer_id: number;
  league_id: string;
  status: string;
  created_at: string;
}

export interface VisitRow {
  league_id: string;
  developer_id: number;
  day: string;
}

/** A login the close asks GitHub about. Same key as PlayPlayer / PlayEntry. */
export type Target = { developer_id: number; login: string };

const other = (s: Side): Side => (s === "claude" ? "codex" : "claude");

/**
 * "Grew the most": members whose row in a war town was created this week,
 * are still active and pass the alt checks. Uses created_at, not joined_at,
 * because joined.ts resets joined_at on every rejoin. A member with an older
 * row in the other war town switched sides, which isn't growth.
 */
export function growthBySide(
  rows: MemberHistoryRow[],
  ids: SideIds,
  counted: Set<number>,
  weekStartDay: string,
  weekEndDay: string,
): Record<Side, number> {
  const from = Date.parse(`${weekStartDay}T00:00:00Z`);
  const to = Date.parse(`${weekEndDay}T00:00:00Z`);
  const olderIn = new Map<string, Set<number>>();
  for (const r of rows) {
    if (Date.parse(r.created_at) >= from) continue;
    const set = olderIn.get(r.league_id) ?? new Set<number>();
    set.add(r.developer_id);
    olderIn.set(r.league_id, set);
  }

  const out: Record<Side, number> = { claude: 0, codex: 0 };
  for (const side of SIDES) {
    const town = ids[side];
    if (!town) continue;
    const rival = ids[other(side)];
    for (const r of rows) {
      if (r.league_id !== town || r.status !== "active" || !counted.has(r.developer_id)) continue;
      const at = Date.parse(r.created_at);
      if (at < from || at >= to) continue;
      if (rival && olderIn.get(rival)?.has(r.developer_id)) continue;
      out[side]++;
    }
  }
  return out;
}

/**
 * "Most visited": visits to each war town from counted players on neither
 * side. One row per person per day already (town_visits PK). Players not in
 * `sideOf` aren't town members, so they never count.
 */
export function visitsBySide(
  rows: VisitRow[],
  ids: SideIds,
  counted: Set<number>,
  sideOf: Map<number, Side | null>,
): { visitDays: Record<Side, number>; uniqueVisitors: Record<Side, number> } {
  const visitDays: Record<Side, number> = { claude: 0, codex: 0 };
  const unique: Record<Side, Set<number>> = { claude: new Set(), codex: new Set() };
  for (const r of rows) {
    const side = SIDES.find((s) => ids[s] === r.league_id);
    if (!side) continue;
    if (!counted.has(r.developer_id) || !sideOf.has(r.developer_id) || sideOf.get(r.developer_id) !== null) continue;
    visitDays[side]++;
    unique[side].add(r.developer_id);
  }
  return { visitDays, uniqueVisitors: { claude: unique.claude.size, codex: unique.codex.size } };
}

/**
 * Who the close asks GitHub about: contributions for the top `refetchTop`
 * of the ranking (rankPlayers returns scorers only), and createdAt for
 * anyone in the top `checkTop` or on a war side, scorer or not, whose
 * account_created_at is still null.
 */
export function refetchTargets(
  ranked: Target[],
  players: (Target & { side: Side | null; account_created_at: string | null })[],
  refetchTop: number,
  checkTop: number,
): { top: Target[]; needCreated: Target[] } {
  const top = ranked.slice(0, refetchTop).map((e) => ({ developer_id: e.developer_id, login: e.login }));
  const checked = new Set(ranked.slice(0, checkTop).map((e) => e.developer_id));
  const needCreated = players
    .filter((p) => p.account_created_at === null && (checked.has(p.developer_id) || p.side !== null))
    .map((p) => ({ developer_id: p.developer_id, login: p.login }));
  return { top, needCreated };
}

/** The `totals` argument of countedIds: each scorer's week total (2× included, no prize bonus). */
export function weekTotals(entries: { developer_id: number; total: number }[]): Map<number, number> {
  return new Map(entries.map((e) => [e.developer_id, e.total]));
}

/** Union of each player's `seen` hashes over the week's town_play_days rows. */
export function mergeSeen(rows: { developer_id: number; seen: string[] | null }[]): Map<number, string[]> {
  const sets = new Map<number, Set<string>>();
  for (const r of rows) {
    const set = sets.get(r.developer_id) ?? new Set<string>();
    for (const h of r.seen ?? []) set.add(h);
    sets.set(r.developer_id, set);
  }
  return new Map([...sets].map(([id, set]) => [id, [...set].sort()]));
}
