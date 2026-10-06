import "server-only";
import { unstable_cache } from "next/cache";
import { latestPlayWeekRow } from "./play-load";
import { playPhase } from "./play-rules";
import { rulesView, type PlayRulesView } from "./play-rules-view";

export type { PlayRulesView, RulesBonus } from "./play-rules-view";

// Only next_bonus is read here; the close writes it once a week, so 5 minutes is fresh enough.
const cachedBonusRow = unstable_cache(
  async () => {
    const row = await latestPlayWeekRow();
    return row ? { next_bonus: row.next_bonus } : null;
  },
  ["towns-play-rules-v1"],
  { revalidate: 300 },
);

/** The rules page's numbers for `now`. The DB is read only in a prize week, for the smaller-side bonus. */
export async function getPlayRules(now: Date = new Date()): Promise<PlayRulesView> {
  const t = now.getTime();
  if (playPhase(t) !== "prize") return rulesView(t, null);
  const row = await cachedBonusRow().catch((err) => {
    console.error("[towns/rules] bonus read failed:", err);
    return null;
  });
  return rulesView(t, row);
}
