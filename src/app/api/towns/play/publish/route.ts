import { NextRequest, NextResponse } from "next/server";
import { getPlayWeekRow } from "@/lib/towns/play-load";
import { publishPlayWeek, withCodes } from "@/lib/towns/play-publish";
import { publishRefusal, sendPrizeWinners } from "@/lib/notification-senders/towns-prize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─── Publish a week's winners, by hand ───────────────────────────────────────
// The Monday close publishes on its own; this is the backup. `?week=YYYY-MM-DD`
// (the Monday the week started) publishes it if it isn't yet. `&resend=1` on a
// published week retries failed emails only (the sends are deduped per
// developer and week).

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const week = request.nextUrl.searchParams.get("week") ?? "";
  const refusal = publishRefusal(week, { replyTo: process.env.PRIZE_REPLY_TO });
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });

  try {
    if (request.nextUrl.searchParams.get("resend") === "1") {
      const row = await getPlayWeekRow(week);
      if (!row?.published_at) return NextResponse.json({ error: "Not published yet" }, { status: 409 });
      const logins = row.winners ?? [];
      const emailed = await sendPrizeWinners(week, await withCodes(week, row.standings.filter((e) => logins.includes(e.login))));
      return NextResponse.json({ ok: true, resent: true, winners: logins, emailed });
    }
    const r = await publishPlayWeek(week);
    if (r.status === "missing") return NextResponse.json({ error: "This week isn't closed yet" }, { status: 404 });
    if (r.status === "already") return NextResponse.json({ ok: false, reason: "already published", winners: r.winners }, { status: 409 });
    return NextResponse.json({ ok: true, week, winners: r.winners, emailed: r.emailed });
  } catch (err) {
    console.error("[play-publish]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
