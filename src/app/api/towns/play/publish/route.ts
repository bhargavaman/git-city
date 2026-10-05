import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isoDay } from "@/lib/leagues/scoring";
import { BATTLE_START } from "@/lib/towns/rivalry";
import { ONE_PRIZE_PER_SEASON } from "@/lib/towns/play-rules";
import { pickWinners } from "@/lib/towns/play-score";
import { getPlayWeekRow } from "@/lib/towns/play-load";
import { publishRefusal, sendPrizeWinners } from "@/lib/notification-senders/towns-prize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─── Publish the week's winners ──────────────────────────────────────────────
// Sam runs this by hand after the Monday top-15 check: `?week=YYYY-MM-DD` (the
// Monday the week started). It picks the winners from the frozen standings
// minus `excluded`, writes them once, and emails them. A second call does
// nothing; `&resend=1` on a published week retries failed emails only (the
// sends are deduped per developer and week).

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const week = request.nextUrl.searchParams.get("week") ?? "";
  const refusal = publishRefusal(week, { replyTo: process.env.PRIZE_REPLY_TO });
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });

  try {
    const row = await getPlayWeekRow(week);
    if (!row) return NextResponse.json({ error: "This week isn't closed yet" }, { status: 404 });

    if (row.published_at) {
      if (request.nextUrl.searchParams.get("resend") !== "1") {
        return NextResponse.json({ ok: false, reason: "already published" }, { status: 409 });
      }
      const logins = row.winners ?? [];
      const emailed = await sendPrizeWinners(week, row.standings.filter((e) => logins.includes(e.login)));
      return NextResponse.json({ ok: true, resent: true, winners: logins, emailed });
    }

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
    if (!updated || updated.length === 0) {
      return NextResponse.json({ ok: false, reason: "already published" }, { status: 409 });
    }

    const emailed = await sendPrizeWinners(week, winners);
    return NextResponse.json({ ok: true, week, winners: logins, emailed });
  } catch (err) {
    console.error("[play-publish]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
