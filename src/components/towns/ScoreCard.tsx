import type { FeaturedActivity } from "@/lib/towns/play-rules";
import { scoringRows, teamRows } from "@/lib/towns/play-board";

// Points per action and daily cap, then the team bonus. Shared by /towns and
// /towns/rules so both show the same card.
export default function ScoreCard({ featured, note }: { featured: FeaturedActivity | null; note?: string }) {
  return (
    <div className="border-[3px] border-border bg-bg-card p-3 sm:p-4">
      <p className="text-xs text-muted">How to score</p>
      <ul className="mt-3 flex flex-col gap-2.5" aria-label="Points">
        {scoringRows(featured).map((r) => (
          <li key={r.activity} className="flex items-baseline gap-3 text-xs">
            <span className="min-w-0 flex-1 text-cream normal-case">
              {r.label}
              {r.doubled && <span className="ml-2 text-lime">2×</span>}
            </span>
            <span className={`w-14 shrink-0 text-right tabular-nums ${r.doubled ? "text-lime" : "text-cream"}`}>{r.pts}</span>
            <span className="w-16 shrink-0 text-right text-muted tabular-nums">{r.cap ?? ""}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t-[3px] border-border pt-3 text-xs text-muted">Team</p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {teamRows().map((r) => (
          <li key={r.label} className="flex items-baseline gap-3 text-xs">
            <span className="min-w-0 flex-1 text-cream normal-case">{r.label}</span>
            <span className="w-14 shrink-0 text-right text-cream tabular-nums">{r.pts}</span>
            <span className="w-16 shrink-0" />
          </li>
        ))}
      </ul>
      {note && <p className="mt-4 text-xs text-muted normal-case">{note}</p>}
    </div>
  );
}
