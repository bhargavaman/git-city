import { NextRequest, NextResponse } from "next/server";
import { weekStart } from "@/lib/leagues/scoring";
import { closePlayWeek } from "@/lib/towns/play";
import { PRACTICE_START } from "@/lib/towns/play-rules";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── Play week close, by hand ────────────────────────────────────────────────
// `?week=YYYY-MM-DD` freezes that week if it has no row yet (same as the
// Monday cron). `&force=1` deletes and rebuilds it, only while unpublished.

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const week = request.nextUrl.searchParams.get("week");
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return NextResponse.json({ error: "Bad week" }, { status: 400 });
  const start = weekStart(new Date(`${week}T12:00:00Z`));
  if (start.getTime() < PRACTICE_START) return NextResponse.json({ error: "Before the practice week" }, { status: 400 });
  const force = request.nextUrl.searchParams.get("force") === "1";

  try {
    const { written, row } = await closePlayWeek(start, { force });
    return NextResponse.json({
      ok: true,
      written,
      week_start: row.week_start,
      featured: row.featured,
      bonus_pct: row.bonus_pct,
      next_bonus: row.next_bonus,
      scorers: row.standings.length,
      counted: row.standings.filter((e) => e.counted).length,
      winner: row.war.winner,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "published") {
      return NextResponse.json({ error: "published" }, { status: 409 });
    }
    console.error("[play-close]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
