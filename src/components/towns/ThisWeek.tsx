import Link from "next/link";
import { Avatar } from "@/components/league/hud/shared";
import type { PlayBoard } from "@/lib/towns/play";
import { PRIZE_WINNERS, RULES_PATH } from "@/lib/towns/play-rules";
import { boardHeading, bonusLine, prizeNote, sideColor, winnersLine } from "@/lib/towns/play-board";
import ScoreCard from "./ScoreCard";

// Under the war bar: how to score on the left, the week's top 10 on the right
// (stacked on phones). The hero already says how a side wins; this section
// only adds what it doesn't: the points, the team bonus and who leads.
export default function ThisWeek({ board }: { board: PlayBoard }) {
  const top = board.entries.filter((e) => e.prize > 0).slice(0, PRIZE_WINNERS);
  const bonus = board.bonus ? bonusLine(board.bonus) : null;

  return (
    <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg text-cream sm:text-xl">{boardHeading(board.phase)}</h2>
        <Link href={RULES_PATH} className="inline-flex min-h-11 items-center text-xs text-muted transition-colors hover:text-cream">
          Full rules →
        </Link>
      </div>

      <div className="mt-2 grid gap-3 md:grid-cols-2 md:gap-6">
        <ScoreCard featured={board.featured} />

        <div className="border-[3px] border-border bg-bg-card p-3 sm:p-4">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <p className="text-muted">Top {PRIZE_WINNERS}</p>
            <p className="text-right text-muted normal-case">{prizeNote(board.phase)}</p>
          </div>
          {top.length === 0 ? (
            <p className="mt-3 text-xs text-muted normal-case">Nobody scored yet</p>
          ) : (
            <ol className="mt-1">
              {top.map((e, i) => {
                const color = sideColor(e.side);
                return (
                  <li key={e.login}>
                    <Link href={`/dev/${e.login}`} className="flex min-h-9 items-center gap-2 text-xs hover:text-cream">
                      <span className={`w-5 shrink-0 text-right tabular-nums ${i === 0 ? "text-lime" : "text-dim"}`}>{i + 1}</span>
                      <Avatar src={e.avatar_url} size={20} />
                      <span className={`min-w-0 flex-1 truncate normal-case ${color ? "" : "text-cream"}`} style={color ? { color } : undefined}>
                        @{e.login}
                      </span>
                      <span className="shrink-0 text-cream tabular-nums">{e.prize.toLocaleString("en-US")}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
          {(bonus || board.lastWinners) && (
            <div className="mt-3 flex flex-col gap-1.5 border-t-[3px] border-border pt-3 text-xs text-muted normal-case">
              {bonus && (
                <p>
                  <span style={{ color: bonus.color }}>{bonus.name}</span> {bonus.rest}
                </p>
              )}
              {board.lastWinners && <p>{winnersLine(board.lastWinners)}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
