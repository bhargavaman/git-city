import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchWeekContributionDays } from "@/lib/github-api";
import { isoDay, weekDays } from "@/lib/leagues/scoring";
import { BATTLE_START, RIVALRY } from "./rivalry";
import { SIDES } from "./battle-rules";
import { sideSizes, type PlayCategories, type PlayDayRow, type PlayPlayer, type PlayWeekRow } from "./play-score";
import {
  growthBySide,
  lastDay,
  mergeSeen,
  shiftWeek,
  visitsBySide,
  type MemberHistoryRow,
  type SideIds,
  type Target,
  type VisitRow,
} from "./play-close-rules";

const PAGE = 1000;
const GH_BATCH = 20;
// PlayWeekRow's columns. created_at stays in the table for Sam's checks, not in the type.
const WEEK_COLUMNS =
  "week_start, standings, war, featured, bonus_side, bonus_pct, next_bonus, excluded, winners, published_at";

/** Reads every page of a ranged query. */
async function pages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function rivalryLeagueIds(): Promise<SideIds> {
  const { data, error } = await getSupabaseAdmin()
    .from("leagues")
    .select("id, slug")
    .in("slug", RIVALRY.map((r) => r.slug));
  if (error) throw error;
  const id = (i: 0 | 1): string | null => ((data ?? []).find((l) => l.slug === RIVALRY[i].slug)?.id as string | undefined) ?? null;
  return { claude: id(0), codex: id(1) };
}

interface MemberRow {
  developer_id: number;
  league_id: string;
  developers: {
    github_login: string;
    avatar_url: string | null;
    claimed_at: string | null;
    account_created_at: string | null;
    claimed_by: string | null;
  } | null;
}

/**
 * Every active member of any town, once each, as Task 7's PlayPlayer: their
 * war side (null outside the two war towns) and the week's `seen` hashes.
 * Unclaimed developers stay in; countedIds drops them (claimed_at is null).
 */
export async function loadPlayPlayers(weekStart: string): Promise<PlayPlayer[]> {
  const sb = getSupabaseAdmin();
  const ids = await rivalryLeagueIds();
  const rows = await pages<MemberRow>((from, to) =>
    sb
      .from("league_members")
      .select(
        "developer_id, league_id, developers!league_members_developer_id_fkey(github_login, avatar_url, claimed_at, account_created_at, claimed_by)",
      )
      .eq("status", "active")
      .order("developer_id")
      .order("league_id")
      .range(from, to)
      .returns<MemberRow[]>(),
  );

  const players = new Map<number, PlayPlayer>();
  for (const r of rows) {
    const d = r.developers;
    if (!d) continue;
    const side = SIDES.find((s) => ids[s] === r.league_id) ?? null;
    const known = players.get(r.developer_id);
    if (known) {
      if (!known.side) known.side = side;
      continue;
    }
    const player: PlayPlayer = {
      developer_id: r.developer_id,
      login: d.github_login,
      avatar_url: d.avatar_url,
      side,
      claimed_at: d.claimed_at,
      account_created_at: d.account_created_at,
      claimed_by: d.claimed_by,
      seen: [],
    };
    players.set(r.developer_id, player);
  }

  const seenRows = await pages<{ developer_id: number; seen: string[] | null }>((from, to) =>
    sb
      .from("town_play_days")
      .select("developer_id, seen")
      .gte("day", weekStart)
      .lte("day", lastDay(weekStart))
      .order("developer_id")
      .order("day")
      .range(from, to)
      .returns<{ developer_id: number; seen: string[] | null }[]>(),
  );
  const seen = mergeSeen(seenRows);
  for (const p of players.values()) p.seen = seen.get(p.developer_id) ?? [];
  return [...players.values()];
}

/** Capped points per player per UTC day, `from`..`to` inclusive (no 2× here). */
export async function loadPlayDays(from: string, to: string): Promise<PlayDayRow[]> {
  const sb = getSupabaseAdmin();
  // The untyped client reads a set-returning RPC as one object; its rows are PlayDayRow.
  type Page = PromiseLike<{ data: PlayDayRow[] | null; error: { message: string } | null }>;
  return pages<PlayDayRow>(
    (a, b) =>
      sb
        .rpc("play_day_points", { p_from: from, p_to: to })
        .order("developer_id")
        .order("day")
        .range(a, b) as unknown as Page,
  );
}

/** Raw counts for the two team categories, with the §3 hidden checks applied (`counted` from countedIds). */
export async function loadCategories(
  weekStart: string,
  players: PlayPlayer[],
  counted: Set<number>,
): Promise<PlayCategories> {
  const sb = getSupabaseAdmin();
  const ids = await rivalryLeagueIds();
  const towns = SIDES.flatMap((s) => (ids[s] ? [ids[s] as string] : []));
  const end = shiftWeek(weekStart, 1);

  const members =
    towns.length === 0
      ? []
      : await pages<MemberHistoryRow>((from, to) =>
          sb
            .from("league_members")
            .select("developer_id, league_id, status, created_at")
            .in("league_id", towns)
            .order("developer_id")
            .order("league_id")
            .range(from, to)
            .returns<MemberHistoryRow[]>(),
        );
  const visits =
    towns.length === 0
      ? []
      : await pages<VisitRow>((from, to) =>
          sb
            .from("town_visits")
            .select("league_id, developer_id, day")
            .in("league_id", towns)
            .gte("day", weekStart)
            .lt("day", end)
            .order("league_id")
            .order("developer_id")
            .order("day")
            .range(from, to)
            .returns<VisitRow[]>(),
        );

  const sideOf = new Map(players.map((p) => [p.developer_id, p.side]));
  const v = visitsBySide(visits, ids, counted, sideOf);
  return {
    growth: growthBySide(members, ids, counted, weekStart, end),
    sizes: sideSizes(players, weekStart),
    visitDays: v.visitDays,
    uniqueVisitors: v.uniqueVisitors,
  };
}

/**
 * The close's GitHub pass, 20 logins per request: fresh contributions for
 * `top` (upserted like the hourly job), and account_created_at for
 * `needCreated`, written only where it is still null. A failed batch keeps
 * the old values.
 */
export async function refetchForClose(start: Date, top: Target[], needCreated: Target[]): Promise<void> {
  const sb = getSupabaseAdmin();
  const startDay = isoDay(start);
  const validDays = new Set(weekDays(start));
  const topIds = new Map(top.map((t) => [t.login.toLowerCase(), t.developer_id]));
  const createdIds = new Map(needCreated.map((t) => [t.login.toLowerCase(), t.developer_id]));
  const logins = [...new Set([...top, ...needCreated].map((t) => t.login))];

  for (let i = 0; i < logins.length; i += GH_BATCH) {
    const { results } = await fetchWeekContributionDays(logins.slice(i, i + GH_BATCH), start);
    const now = new Date().toISOString();
    const rows = results.flatMap((r) => {
      const id = topIds.get(r.login.toLowerCase());
      if (!id) return [];
      return r.days
        .filter((d) => validDays.has(d.date))
        .map((d) => ({ developer_id: id, week_start: startDay, day: d.date, contributions: d.count, fetched_at: now }));
    });
    if (rows.length > 0) {
      const { error } = await sb.from("league_weekly_stats").upsert(rows, { onConflict: "developer_id,day" });
      if (error) console.error("[play-close] refetch stats:", error.message);
    }
    for (const r of results) {
      const id = createdIds.get(r.login.toLowerCase());
      if (!id || !r.createdAt) continue;
      const { error } = await sb
        .from("developers")
        .update({ account_created_at: r.createdAt })
        .eq("id", id)
        .is("account_created_at", null);
      if (error) console.error(`[play-close] createdAt ${r.login}:`, error.message);
    }
  }
}

export async function getPlayWeekRow(weekStart: string): Promise<PlayWeekRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("town_play_weeks")
    .select(WEEK_COLUMNS)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  return (data as PlayWeekRow | null) ?? null;
}

/** The newest frozen week of the season (the rules page reads it). */
export async function latestPlayWeekRow(): Promise<PlayWeekRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("town_play_weeks")
    .select(WEEK_COLUMNS)
    .gte("week_start", isoDay(new Date(BATTLE_START)))
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PlayWeekRow | null) ?? null;
}
