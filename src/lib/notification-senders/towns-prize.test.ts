import { afterEach, describe, expect, it, vi } from "vitest";
import type { NotificationPayload } from "../notifications";

// notifications.ts throws at import without UNSUBSCRIBE_HMAC_SECRET and talks
// to Supabase; the sender only needs sendNotification, so stub it.
const sent = vi.hoisted(() => [] as NotificationPayload[]);
vi.mock("../notifications", () => ({
  sendNotification: vi.fn(async (p: NotificationPayload) => {
    sent.push(p);
    return [{ channel: "email", success: true }];
  }),
}));

import { publishRefusal, renderPrizeWinnerEmail, sendPrizeWinners, weekCode, type PrizeWinnerEmailData } from "./towns-prize";
import { PREVIEW_LINKS, TRANSACTIONAL_PREVIEW_LINKS } from "../email/previews/types";

const GLORY: PrizeWinnerEmailData = { week: 2, sponsor: null, delivery: "reply" };
const REPLY: PrizeWinnerEmailData = { week: 2, sponsor: "Firecrawl", delivery: "reply" };
const CODE: PrizeWinnerEmailData = { week: 2, sponsor: "Firecrawl", delivery: "code" };
const render = (d: PrizeWinnerEmailData) => renderPrizeWinnerEmail(d, TRANSACTIONAL_PREVIEW_LINKS);

describe("renderPrizeWinnerEmail", () => {
  it("puts the week number in the subject", () => {
    expect(render({ ...GLORY, week: 3 }).subject).toBe("You won week 3 of Git City Towns");
  });

  it("glory only never names a sponsor or credits", () => {
    const e = render(GLORY);
    expect(e.html).not.toMatch(/firecrawl|credits/i);
    expect(e.text).not.toMatch(/firecrawl|credits/i);
    expect(e.text).toContain("You're one of the 5 players of week 2 in Git City Towns.");
    expect(e.text).toContain("Your login is on /towns and in our Monday post.");
  });

  it("sponsor + reply asks for the sponsor account email", () => {
    const e = render(REPLY);
    expect(e.text).toContain("You won 2,500 Firecrawl credits in Git City Towns.");
    expect(e.text).toContain("Reply with the email of your Firecrawl account and we'll pass it on.");
  });

  it("sponsor + a coupon link makes the claim button", () => {
    const e = render({ ...CODE, code: "https://firecrawl.dev/c/ABC" });
    expect(e.text).toContain("You won 2,500 Firecrawl credits in Git City Towns.");
    expect(e.text).toContain("Claim your credits: https://firecrawl.dev/c/ABC");
    expect(e.html).toContain('href="https://firecrawl.dev/c/ABC"');
    expect(e.text).not.toContain("Reply with");
  });

  it("sponsor + a plain code prints it and links Firecrawl", () => {
    const e = render({ ...CODE, code: "GITCITY-ABC" });
    expect(e.text).toContain("Your code: GITCITY-ABC");
    expect(e.text).toContain("Redeem it in Firecrawl under Settings → Billing → Coupons: https://www.firecrawl.dev/app");
    expect(e.html).toContain("Redeem your credits");
  });

  it("picks the week's code from PRIZE_CODES", () => {
    const raw = "W1CODE, W2CODE,W3CODE,W4CODE";
    expect(weekCode(raw, "2026-10-12")).toBe("W1CODE");
    expect(weekCode(raw, "2026-10-19")).toBe("W2CODE");
    expect(weekCode(raw, "2026-11-02")).toBe("W4CODE");
    expect(weekCode(raw, "2026-11-09")).toBeNull();
    expect(weekCode(undefined, "2026-10-12")).toBeNull();
    expect(weekCode("", "2026-10-12")).toBeNull();
  });

  it("never talks about money, payment or raffles", () => {
    for (const d of [GLORY, REPLY, CODE]) {
      const e = render(d);
      expect(e.html).not.toMatch(/\bpay|payment|raffle|money/i);
      expect(e.text).not.toMatch(/\bpay|payment|raffle|money/i);
    }
  });

  it("links the rules in html and text", () => {
    const e = renderPrizeWinnerEmail(REPLY, PREVIEW_LINKS);
    expect(e.html).toContain("/towns/rules?utm_source=email");
    expect(e.html).toContain("utm_campaign=play_prize");
    expect(e.html).toContain("How scoring and checks work");
    expect(e.text).toMatch(/How scoring and checks work: \S+\/towns\/rules\?\S*utm_campaign=play_prize/);
  });

  it("links the board with the play_prize campaign", () => {
    expect(render(GLORY).text).toMatch(/See the board: https?:\/\/[^\s]+\/towns\?[^\s]*utm_campaign=play_prize/);
  });
});

describe("publishRefusal", () => {
  const ok = { replyTo: "samuel@thegitcity.com" };

  it("refuses a week before the season", () => {
    expect(publishRefusal("2026-10-05", ok)?.status).toBe(400);
  });

  it("refuses a day that isn't a Monday, or a malformed week", () => {
    expect(publishRefusal("2026-10-20", ok)?.status).toBe(400);
    expect(publishRefusal("2026-13-45", ok)?.status).toBe(400);
    expect(publishRefusal("oct-19", ok)?.status).toBe(400);
    expect(publishRefusal("", ok)?.status).toBe(400);
  });

  it("needs PRIZE_REPLY_TO only when a sponsor's winners must reply", () => {
    expect(publishRefusal("2026-10-26", { replyTo: undefined, sponsor: "Firecrawl", delivery: "reply" })).toEqual({
      status: 500,
      error: "Set PRIZE_REPLY_TO",
    });
    expect(publishRefusal("2026-10-26", { replyTo: undefined, sponsor: "Firecrawl", delivery: "code" })).toBeNull();
    expect(publishRefusal("2026-10-26", { replyTo: undefined, sponsor: null, delivery: "reply" })).toBeNull();
  });

  it("lets a prize week through", () => {
    expect(publishRefusal("2026-10-12", ok)).toBeNull();
    expect(publishRefusal("2026-11-09", ok)).toBeNull();
  });
});

describe("sendPrizeWinners", () => {
  afterEach(() => {
    sent.length = 0;
    delete process.env.PRIZE_REPLY_TO;
  });

  it("sends one forced, deduped email per winner with a code, and holds the rest", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const n = await sendPrizeWinners("2026-10-19", [
      { developer_id: 7, login: "pyromains", code: "https://firecrawl.dev/c/A" },
      { developer_id: 12, login: "srizzon", code: "https://firecrawl.dev/c/B" },
      { developer_id: 13, login: "nocode", code: null },
    ]);
    expect(n).toBe(2);
    expect(sent.map((p) => p.dedupKey)).toEqual(["play_prize:7:2026-10-19", "play_prize:12:2026-10-19"]);
    for (const p of sent) {
      expect(p.type).toBe("play_prize");
      expect(p.category).toBe("leagues");
      expect(p.forceSend).toBe(true);
      expect(p.channels).toEqual(["email"]);
      expect(p.title).toBe("You won week 2 of Git City Towns");
      expect(p.replyTo).toBeUndefined();
    }
  });

  it("sends nothing for an empty list", async () => {
    expect(await sendPrizeWinners("2026-10-19", [])).toBe(0);
    expect(sent).toHaveLength(0);
  });
});
