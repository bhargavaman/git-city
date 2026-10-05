import type { FeaturedActivity } from "@/lib/towns/play-rules";
import { SCORING_HEADLINE, SCORING_LINES, scoringRows, teamLine } from "@/lib/towns/play-board";

// The poster's rules in one look: the headline, the two dynamic rules, the 5
// activities with points and daily cap, then the team categories. One row
// layout at every width: the label wraps on the left, "1 pt · 200/day" stays
// on the right, so nothing collides at 375px.
export default function ScoringTable({ featured }: { featured: FeaturedActivity | null }) {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-center text-sm leading-relaxed text-balance text-lime normal-case sm:text-base">{SCORING_HEADLINE}</p>
      <div className="mt-2 flex flex-col items-center gap-1 text-center text-xs text-muted normal-case sm:text-sm">
        {SCORING_LINES.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <ul className="mt-5 border-[3px] border-border bg-bg-raised" aria-label="Points">
        {scoringRows(featured).map((r) => (
          <li key={r.activity} className="flex items-baseline justify-between gap-3 border-b-[3px] border-border px-3 py-2.5 last:border-b-0 sm:px-4">
            <span className="min-w-0 text-xs leading-relaxed text-cream normal-case sm:text-sm">
              {r.label}
              {r.doubled && <span className="ml-2 whitespace-nowrap text-lime">2× this week</span>}
            </span>
            <span className={`shrink-0 whitespace-nowrap text-xs tabular-nums sm:text-sm ${r.doubled ? "text-lime" : "text-cream"}`}>{r.value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-xs leading-relaxed text-muted normal-case sm:text-sm">{teamLine()}</p>
    </div>
  );
}
