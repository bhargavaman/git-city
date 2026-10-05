import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isoDay, weekDays, weekEnd, weekStart } from "@/lib/leagues/scoring";
import { BATTLE_START } from "./rivalry";
import { CHECK_TOP, REFETCH_TOP, featuredFor, playPhase, type FeaturedActivity, type PlayPhase } from "./play-rules";
import { buildWar, countedIds, nextBonus, rankPlayers, sideSizes, type PlayEntry, type PlayWeekRow, type SideBonus } from "./play-score";
import { getPlayWeekRow, loadCategories, loadPlayDays, loadPlayPlayers, refetchForClose } from "./play-load";
import { lastDay, refetchTargets, shiftWeek, weekTotals } from "./play-close-rules";
import { boardWeek, type LastWinners } from "./play-board";

/**
 * Freezes one play week into town_play_weeks: standings (every player with
 * 1+ point, both eligibility flags), the war, the week's 2× activity and
 * smaller-side bonus, and next_bonus, the bonus for the week opening now (no
 * row holds it until that week closes, spec §11.3). Once written, a row never
 * changes, except through `force` while it is unpublished.
 */
export async function closePlayWeek(
  start: Date,
  opts: { force?: boolean } = {},
): Promise<{ written: boolean; row: PlayWeekRow }> {
  const sb = getSupabaseAdmin();
  const day = isoDay(start);

  const existing = await getPlayWeekRow(day);
  if (existing) {
    if (!opts.force) return { written: false, row: existing };
    if (existing.published_at) throw new Error("published");
    const { error } = await sb.from("town_play_weeks").delete().eq("week_start", day).is("published_at", null);
    if (error) throw error;
  }

  // 1. This week's 2× activity, and the bonus last week's close set for it.
  const featured = featuredFor(day);
  const bonus = day >= isoDay(new Date(BATTLE_START)) ? ((await getPlayWeekRow(shiftWeek(day, -1)))?.next_bonus ?? null) : null;
  const to = lastDay(day);

  // 2. Rank, re-fetch the top from GitHub (and missing account ages), rank again.
  let players = await loadPlayPlayers(day);
  let rows = await loadPlayDays(day, to);
  const first = rankPlayers(players, rows, { weekStart: day, featured, bonus });
  const { top, needCreated } = refetchTargets(first, players, REFETCH_TOP, CHECK_TOP);
  if (top.length > 0 || needCreated.length > 0) {
    await refetchForClose(start, top, needCreated);
    players = await loadPlayPlayers(day);
    rows = await loadPlayDays(day, to);
  }
  const entries = rankPlayers(players, rows, { weekStart: day, featured, bonus });

  // 3. The war. countedIds runs over every player (0-point members count
  //    for growth and visits), with the same totals rankPlayers used, so
  //    it agrees with each entry's `counted`.
  const counted = countedIds(players, weekTotals(entries), day);
  const cats = await loadCategories(day, players, counted);
  const war = buildWar(entries, cats);

  // 4. The bonus for the week opening now, only when it is a prize week.
  const nextDay = shiftWeek(day, 1);
  const next_bonus = featuredFor(nextDay) ? nextBonus(sideSizes(players, nextDay)) : null;

  // 5. Insert once; a concurrent or repeated run keeps the first row.
  const { data: inserted, error } = await sb
    .from("town_play_weeks")
    .upsert(
      {
        week_start: day,
        standings: entries,
        war,
        featured,
        bonus_side: bonus?.side ?? null,
        bonus_pct: bonus?.pct ?? 0,
        next_bonus,
      },
      { onConflict: "week_start", ignoreDuplicates: true },
    )
    .select("week_start");
  if (error) throw error;

  const row = await getPlayWeekRow(day);
  if (!row) throw new Error(`town_play_weeks ${day} missing after insert`);
  return { written: (inserted ?? []).length > 0, row };
}

export interface PlayBoard {
  /** `end` is the exclusive next Monday, as in BattleState. */
  week: { start: string; end: string };
  phase: PlayPhase;
  featured: FeaturedActivity | null;
  /** This week's smaller-side bonus, prize weeks only. */
  bonus: SideBonus | null;
  /** Every active town member, in prize tie-break order (`prize` includes the bonus). */
  entries: PlayEntry[];
  lastWinners: LastWinners | null;
}

async function loadBoard(startDay: string): Promise<PlayBoard> {
  const start = new Date(`${startDay}T00:00:00Z`);
  const prev = new Date(start);
  prev.setUTCDate(prev.getUTCDate() - 7);
  const [players, rows, ended] = await Promise.all([
    loadPlayPlayers(startDay),
    loadPlayDays(startDay, weekDays(start)[6]),
    // The week that just ended set this week's bonus (next_bonus) and holds its winners.
    getPlayWeekRow(isoDay(prev)),
  ]);
  const phase = playPhase(start.getTime());
  const featured = featuredFor(startDay);
  const { bonus, lastWinners } = boardWeek(ended, phase);
  return {
    week: { start: startDay, end: isoDay(weekEnd(start)) },
    phase,
    featured,
    bonus,
    entries: rankPlayers(players, rows, { weekStart: startDay, featured, bonus }),
    lastWinners,
  };
}

// Points move with every smash, raid and hourly stats run; 5 minutes is fresh enough (as towns-battle-v2).
const cachedBoard = unstable_cache(loadBoard, ["towns-play-board-v1"], { revalidate: 300 });

/** This week's play standings for /towns, keyed by the week's Monday. */
export async function getPlayBoard(now: Date = new Date()): Promise<PlayBoard> {
  return cachedBoard(isoDay(weekStart(now)));
}
