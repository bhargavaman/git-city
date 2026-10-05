import Link from "next/link";
import { Avatar } from "@/components/league/hud/shared";
import type { PlayBoard } from "@/lib/towns/play";
import { PRIZE_WINNERS, RULES_PATH } from "@/lib/towns/play-rules";
import { boardHeading, bonusLine, finePrint, prizeLine, sideColor, sponsorLine, winnersLine } from "@/lib/towns/play-board";

// The prize board under the poster: the top 10 of every town member this week,
// in tie-break order, in prize points (`prize`, the smaller-side bonus
// included). Rows match WeekRanking's. Not built until players ask (§5): your
// own row, a week toggle, "today N/200".
export default function PlayersThisWeek({ board }: { board: PlayBoard }) {
  const top = board.entries.filter((e) => e.prize > 0).slice(0, PRIZE_WINNERS);
  const bonus = board.bonus ? bonusLine(board.bonus) : null;
  const sponsor = sponsorLine();

  return (
    <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
      <h2 className="text-lg text-cream sm:text-xl">{boardHeading(board.phase)}</h2>
      <p className="mt-2 text-xs leading-relaxed text-cream normal-case sm:text-sm">{prizeLine(board.phase)}</p>
      {bonus && (
        <p className="mt-1 text-xs leading-relaxed text-muted normal-case sm:text-sm">
          <span style={{ color: bonus.color }}>{bonus.name}</span> {bonus.rest}
        </p>
      )}

      {top.length === 0 ? (
        <p className="mt-4 border-[3px] border-border bg-bg-card px-4 py-3 text-xs text-muted normal-case">Nobody scored yet this week.</p>
      ) : (
        <ol className="mt-4 space-y-1.5">
          {top.map((e, i) => {
            const color = sideColor(e.side);
            return (
              <li key={e.login}>
                <Link
                  href={`/dev/${e.login}`}
                  className={`flex min-h-11 items-center gap-3 border-[3px] bg-bg-card px-3 py-2 transition-colors hover:border-muted ${i === 0 ? "border-lime" : "border-border"}`}
                >
                  <span className={`w-6 shrink-0 text-right text-xs tabular-nums ${i === 0 ? "text-lime" : "text-muted"}`}>{i + 1}</span>
                  <Avatar src={e.avatar_url} size={24} />
                  <span className={`min-w-0 flex-1 truncate text-xs normal-case ${color ? "" : "text-cream"}`} style={color ? { color } : undefined}>
                    @{e.login}
                  </span>
                  <span className="shrink-0 text-xs text-cream tabular-nums">
                    {e.prize.toLocaleString("en-US")} <span className="text-muted">pts</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-4 flex max-w-2xl flex-col gap-1.5 text-xs leading-relaxed text-muted normal-case">
        {board.lastWinners && <p className="text-cream">{winnersLine(board.lastWinners)}</p>}
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <div className="min-w-0">
            <p>{finePrint()}</p>
            {sponsor && <p>{sponsor}</p>}
          </div>
          <Link href={RULES_PATH} className="inline-flex min-h-11 shrink-0 items-center text-xs text-muted transition-colors hover:text-cream">
            Full rules
          </Link>
        </div>
      </div>
    </section>
  );
}
