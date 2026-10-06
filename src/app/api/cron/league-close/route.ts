import { NextRequest, NextResponse } from "next/server";
import { isoDay, weekStart } from "@/lib/leagues/scoring";
import { closeWeek } from "@/lib/leagues/close";
import { sendLeagueWeeklyResults } from "@/lib/notification-senders/league-weekly";
import { closeTownWeek, type TownWeekResult } from "@/lib/towns/weekly";
import { BATTLE_START, isRivalry } from "@/lib/towns/rivalry";
import { sendBattleResults, sendBattleStart } from "@/lib/notification-senders/towns-battle";
import { closePlayWeek } from "@/lib/towns/play";
import { publishPlayWeek } from "@/lib/towns/play-publish";
import { publishRefusal } from "@/lib/notification-senders/towns-prize";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── Monday week close ───────────────────────────────────────────────────────
// Runs Monday 00:05 UTC and closes the week that just ended. `?week=YYYY-MM-DD`
// closes another week (staging tests: pass the current Monday).

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const param = request.nextUrl.searchParams.get("week");
  let start: Date;
  if (param) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(param)) return NextResponse.json({ error: "Bad week" }, { status: 400 });
    start = weekStart(new Date(`${param}T12:00:00Z`));
  } else {
    start = weekStart(new Date());
    start.setUTCDate(start.getUTCDate() - 7);
  }

  try {
    // Play points first, in their own try: a failed race close can't lose
    // the play week, and a failed play close can't stop the races.
    let play: { written: boolean; week_start: string; publish: unknown } | { skipped: string } | { error: string };
    if (start.getTime() < BATTLE_START) {
      play = { skipped: "before the first week" };
    } else {
      try {
        const r = await closePlayWeek(start);
        // Winners go out with the close: no one has to publish them by hand.
        const refusal = publishRefusal(r.row.week_start, { replyTo: process.env.PRIZE_REPLY_TO });
        const pub = refusal ? { status: "refused", error: refusal.error } : await publishPlayWeek(r.row.week_start);
        play = { written: r.written, week_start: r.row.week_start, publish: pub };
      } catch (err) {
        console.error("[league-close] play:", err);
        play = { error: String(err) };
      }
    }
    // Staging check that a failed race close still leaves the play row. Ignored on prod.
    if (process.env.VERCEL_ENV !== "production" && request.nextUrl.searchParams.get("failClose") === "1") {
      throw new Error("failClose: staging test");
    }

    const { closed, errors, ranked } = await closeWeek(start);

    // Visits rollup and Town of the week, before the emails so they can name
    // the winner. A failure here doesn't undo the race.
    let towns: TownWeekResult | { error: string };
    try {
      towns = await closeTownWeek(start, ranked);
    } catch (err) {
      console.error("[league-close] town week:", err);
      towns = { error: String(err) };
    }
    const townOfWeek = "featured" in towns ? towns.featured : null;

    // Results emails (awaited). From the first battle week on, the two
    // rivalry towns get the battle's result, read from the frozen play week,
    // instead of their town race. If play failed, no battle email (logged).
    let emailed = 0;
    const battleWeek = start.getTime() >= BATTLE_START;
    const rivalry = battleWeek ? closed.filter((c) => isRivalry(c.league.slug)) : [];
    if (battleWeek) {
      try {
        emailed += await sendBattleResults(isoDay(start));
      } catch (err) {
        console.error("[league-close] battle result emails:", err);
      }
    }
    // The week opening now is the first battle week: tell both sides.
    if (start.getTime() + 7 * 86_400_000 === BATTLE_START) {
      try {
        emailed += await sendBattleStart();
      } catch (err) {
        console.error("[league-close] battle start emails:", err);
      }
    }
    for (const c of closed) {
      if (rivalry.includes(c)) continue;
      try {
        emailed += await sendLeagueWeeklyResults(c, townOfWeek);
      } catch (err) {
        console.error(`[league-close] emails for ${c.league.slug}:`, err);
      }
    }

    return NextResponse.json({
      ok: true,
      play,
      towns,
      week_start: start.toISOString().slice(0, 10),
      closed: closed.length,
      winners: closed.filter((c) => c.winnerId).length,
      errors,
      emailed,
    });
  } catch (err) {
    console.error("[league-close]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
