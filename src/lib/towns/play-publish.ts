import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isoDay } from "@/lib/leagues/scoring";
import { BATTLE_START } from "./rivalry";
import { ONE_PRIZE_PER_SEASON, PRIZE_DELIVERY, PRIZE_SPONSOR } from "./play-rules";
import { pickWinners } from "./play-score";
import { getPlayWeekRow } from "./play-load";
import { sendPrizeWinners } from "@/lib/notification-senders/towns-prize";

export type PublishResult =
  | { status: "published"; winners: string[]; emailed: number }
  | { status: "already"; winners: string[] }
  | { status: "missing" };

/**
 * Picks a frozen week's winners (standings minus `excluded`, past winners
 * when one prize per season is on), writes them once and emails them. The
 * Monday close calls it right after freezing the week, so nobody has to.
 */
export async function publishPlayWeek(week: string): Promise<PublishResult> {
  const row = await getPlayWeekRow(week);
  if (!row) return { status: "missing" };
  if (row.published_at) return { status: "already", winners: row.winners ?? [] };

  const sb = getSupabaseAdmin();
  const { data: past, error: pastErr } = await sb
    .from("town_play_weeks")
    .select("winners")
    .gte("week_start", isoDay(new Date(BATTLE_START)))
    .not("published_at", "is", null);
  if (pastErr) throw pastErr;
  const pastWinners = [...new Set((past ?? []).flatMap((r) => (r.winners as string[] | null) ?? []))];

  const winners = pickWinners(row.standings, { excluded: row.excluded, pastWinners, onePrize: ONE_PRIZE_PER_SEASON });
  const logins = winners.map((w) => w.login);

  // The WHERE published_at IS NULL makes the publish happen once, even when two calls race.
  const { data: updated, error } = await sb
    .from("town_play_weeks")
    .update({ published_at: new Date().toISOString(), winners: logins })
    .eq("week_start", week)
    .is("published_at", null)
    .select("week_start");
  if (error) throw error;
  if (!updated || updated.length === 0) return { status: "already", winners: logins };

  return { status: "published", winners: logins, emailed: await sendPrizeWinners(week, await withCodes(week, winners)) };
}

/** Each winner with their coupon (claim_play_code, migration 168) when prizes go out as codes. */
export async function withCodes<T extends { developer_id: number }>(week: string, winners: T[]): Promise<(T & { code: string | null })[]> {
  if (!PRIZE_SPONSOR || PRIZE_DELIVERY !== "code") return winners.map((w) => ({ ...w, code: null }));
  const sb = getSupabaseAdmin();
  const out: (T & { code: string | null })[] = [];
  // In order, so the codes go out in rank order.
  for (const w of winners) {
    const { data, error } = await sb.rpc("claim_play_code", { p_week: week, p_dev: w.developer_id });
    if (error) console.error(`[play-publish] code for ${w.developer_id}:`, error.message);
    out.push({ ...w, code: typeof data === "string" ? data : null });
  }
  return out;
}
