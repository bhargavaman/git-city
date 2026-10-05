import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isoDay, weekEnd, weekStart } from "@/lib/leagues/scoring";
import { BATTLE_START, RIVALRY } from "./rivalry";
import { leagueAssetUrl } from "@/lib/league-city/identity";
import { SIDES, battlePhase, battleWeekNumber, dayWinners, finishedDays, seriesRecord, type Side } from "./battle-rules";
import { closedSide, liveSide, type BattleCoder, type SideLoad } from "./battle-sides";
import { getPlayBoard } from "./play";
import { getPlayWeekRow } from "./play-load";
import type { PlayWar } from "./play-score";

export type { BattleCoder };

export interface BattleSide extends SideLoad {
  daysWon: number;
}

/** A closed war week: each side's score (per player plus team categories) and who won. */
export interface WeekScore {
  winner: Side | null;
  claude: number | null;
  codex: number | null;
}

export interface BattleState {
  phase: "pick" | "live";
  /** "result" all Monday (UTC) once last week closed: the sides show that week's final. */
  showing: "live" | "result";
  /** The week the sides show. `number` 1 is the week starting BATTLE_START. */
  week: { start: string; end: string; number: number };
  /** The week that runs now (ends Sunday night): the countdown. */
  current: { start: string; end: string; number: number };
  /** Who won each day, Mon..Sun ("open" = not over yet). */
  dayWinners: (Side | null | "open")[];
  sides: Record<Side, BattleSide>;
  /** The war week that closed last Monday. Null before the first close. */
  lastWeek: (WeekScore & { start: string; number: number }) | null;
  series: Record<Side, number>;
}

const DAY_MS = 86_400_000;

interface WeekLoad {
  live: Record<Side, SideLoad>;
  closed: (WeekScore & { start: string })[];
  /** The last closed week as frozen by the close, for the Monday result. */
  prev: Record<Side, SideLoad> | null;
}

async function rivalryIds(): Promise<Record<Side, string | null>> {
  const { data, error } = await getSupabaseAdmin()
    .from("leagues")
    .select("id, slug")
    .in("slug", RIVALRY.map((r) => r.slug));
  if (error) throw error;
  const id = (i: 0 | 1) => (data ?? []).find((l) => l.slug === RIVALRY[i].slug)?.id ?? null;
  return { claude: id(0), codex: id(1) };
}

const scoreOf = (start: string, war: PlayWar): WeekScore & { start: string } => ({
  start,
  winner: war.winner,
  claude: war.claude.score,
  codex: war.codex.score,
});

async function loadWeek(startDay: string): Promise<WeekLoad> {
  // The live week is the same board /towns lists under the poster.
  const board = await getPlayBoard(new Date(`${startDay}T12:00:00Z`));
  const live = { claude: liveSide(board.entries, "claude"), codex: liveSide(board.entries, "codex") };

  // Closed war weeks, frozen by the Monday close. The practice row
  // (week_start before BATTLE_START) never counts as a war week.
  const { data: rows, error } = await getSupabaseAdmin()
    .from("town_play_weeks")
    .select("week_start, war")
    .gte("week_start", isoDay(new Date(BATTLE_START)))
    .lt("week_start", startDay)
    .order("week_start")
    .returns<{ week_start: string; war: PlayWar }[]>();
  if (error) throw error;
  const closed = (rows ?? []).map((r) => scoreOf(r.week_start, r.war));

  const prevDay = isoDay(new Date(Date.parse(`${startDay}T00:00:00Z`) - 7 * DAY_MS));
  const prevRow = closed.some((w) => w.start === prevDay) ? await getPlayWeekRow(prevDay) : null;
  const prev = prevRow
    ? { claude: closedSide(prevRow.war.claude, prevRow.standings, "claude"), codex: closedSide(prevRow.war.codex, prevRow.standings, "codex") }
    : null;

  return { live, closed, prev };
}

// The board moves with play; 5 minutes is fresh enough.
const cachedWeek = unstable_cache(loadWeek, ["towns-battle-v3"], { revalidate: 300 });

/** Claude vs Codex right now: this week's score and days (last week's final on Mondays), last week's result, the series. */
export async function getBattleState(now: Date = new Date()): Promise<BattleState> {
  const start = weekStart(now);
  const load = await cachedWeek(isoDay(start));

  const prev = new Date(start);
  prev.setUTCDate(prev.getUTCDate() - 7);
  const found = load.closed.find((w) => w.start === isoDay(prev));
  const last = found ? { ...found, number: battleWeekNumber(found.start) } : null;

  const result = !!last && !!load.prev && now.getUTCDay() === 1;
  const shown = result ? prev : start;
  const sides = result ? (load.prev as Record<Side, SideLoad>) : load.live;
  const winners = dayWinners(sides.claude.days, sides.codex.days, result ? 7 : finishedDays(start, now.getTime()));
  const won = (s: Side) => winners.filter((w) => w === s).length;
  const span = (d: Date) => ({ start: isoDay(d), end: isoDay(weekEnd(d)), number: battleWeekNumber(isoDay(d)) });

  return {
    phase: battlePhase(now.getTime()),
    showing: result ? "result" : "live",
    week: span(shown),
    current: span(start),
    dayWinners: winners,
    sides: {
      claude: { ...sides.claude, daysWon: won("claude") },
      codex: { ...sides.codex, daysWon: won("codex") },
    },
    lastWeek: last,
    series: seriesRecord(load.closed.map((w) => w.winner)),
  };
}

/** A closed war week as the Monday close froze it (town_play_weeks). Null when it isn't closed or isn't a war week. */
export async function getWeekResult(startDay: string): Promise<WeekScore | null> {
  if (Date.parse(`${startDay}T00:00:00Z`) < BATTLE_START) return null;
  const row = await getPlayWeekRow(startDay);
  if (!row) return null;
  const { winner, claude, codex } = scoreOf(startDay, row.war);
  return { winner, claude, codex };
}

/** Each rivalry town's logo (its active league_assets logo), for the battle images. */
export async function getRivalryLogos(): Promise<Record<Side, string | null>> {
  const ids = await rivalryIds();
  const { data, error } = await getSupabaseAdmin()
    .from("league_cities")
    .select("league_id, logo:league_assets!league_cities_logo_asset_id_fkey(path, status)")
    .in("league_id", SIDES.flatMap((s) => (ids[s] ? [ids[s] as string] : [])))
    .returns<{ league_id: string; logo: { path: string; status: string } | null }[]>();
  if (error) throw error;
  const logo = (s: Side) => {
    const l = data?.find((r) => r.league_id === ids[s])?.logo;
    return l?.status === "active" ? leagueAssetUrl(l.path) : null;
  };
  return { claude: logo("claude"), codex: logo("codex") };
}
