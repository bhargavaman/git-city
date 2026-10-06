import { NextResponse } from "next/server";
import { getViewer } from "@/lib/leagues/service";
import { getPlayBoard } from "@/lib/towns/play";

export const dynamic = "force-dynamic";

// GET: the signed-in player's points this week and place on the board, for
// the town HUD. Reads the same cached board as /towns (fresh within 5 min).
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    const board = await getPlayBoard();
    const ranked = board.entries.filter((e) => e.prize > 0);
    const i = ranked.findIndex((e) => e.developer_id === viewer.id);
    return NextResponse.json(
      { phase: board.phase, points: i === -1 ? 0 : ranked[i].prize, rank: i === -1 ? null : i + 1 },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[play-me]", err);
    return NextResponse.json({ error: "Couldn't load your points." }, { status: 500 });
  }
}
