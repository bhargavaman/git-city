import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/towns/battle", () => ({ getWeekResult: vi.fn() }));
// notifications.ts throws at import without UNSUBSCRIBE_HMAC_SECRET; the renders never send.
vi.mock("../notifications", () => ({ sendNotification: vi.fn() }));

import { renderBattleResultEmail, renderBattleStartEmail, type BattleResultEmailData } from "./towns-battle";
import { PREVIEW_LINKS } from "../email/previews/types";

const RESULT: BattleResultEmailData = {
  week: 1,
  winner: "claude",
  claude: 84,
  codex: 61,
  side: "codex",
  mine: 42,
  heroUrl: "https://thegitcity.com/towns/battle-image?sample=1",
};

describe("battle emails link the rules", () => {
  it("battle start has the rules link in html and text", () => {
    const e = renderBattleStartEmail({ side: "claude", heroUrl: "https://thegitcity.com/towns/battle-image" }, PREVIEW_LINKS);
    expect(e.html).toContain("/towns/rules?utm_source=email");
    expect(e.html).toContain("utm_campaign=battle_start");
    expect(e.html).toContain("How scoring and checks work");
    expect(e.text).toMatch(/How scoring and checks work: \S+\/towns\/rules\?\S*utm_campaign=battle_start/);
  });

  it("battle result has the rules link in html and text", () => {
    const e = renderBattleResultEmail(RESULT, PREVIEW_LINKS);
    expect(e.html).toContain("/towns/rules?utm_source=email");
    expect(e.html).toContain("utm_campaign=battle_result");
    expect(e.text).toMatch(/How scoring and checks work: \S+\/towns\/rules\?\S*utm_campaign=battle_result/);
  });
});
