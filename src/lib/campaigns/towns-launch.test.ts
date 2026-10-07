import { describe, expect, it } from "vitest";
import { TOWNS_LAUNCH } from "./towns-launch";
import type { CampaignRenderContext } from "./types";

const ctx: CampaignRenderContext = {
  login: "octocat",
  links: {},
  confirmUrl: "https://thegitcity.com/confirm?t=x",
  stats: { buildings: 87600 },
};

const VARIANTS = ["announce", "repermission"] as const;

describe("towns launch copy", () => {
  it("names Oct 12 and per-player points in the announce email", () => {
    const e = TOWNS_LAUNCH.render("announce", ctx);
    expect(e.subject).toBe("Claude vs Codex starts Oct 12");
    expect(e.preheader).toBe("From Mon, Oct 12, everything you do in Git City scores. The side with the most points per player wins the week.");
    expect(e.text).toContain("From Mon, Oct 12, everything you do in Git City scores. The side with the most points per player wins the week.");
    expect(e.html).toContain("Battle starts Oct 12.");
  });

  it("names Oct 12 and per-player points in the repermission email", () => {
    const e = TOWNS_LAUNCH.render("repermission", ctx);
    expect(e.preheader).toBe("Claude vs Codex starts Oct 12. Tell us if you want updates like this.");
    expect(e.text).toContain("on Oct 12 it starts a weekly war: Claude devs against Codex devs, and the side with the most points per player wins.");
    expect(e.html).toContain("Battle starts Oct 12.");
  });

  it("names the weekly Firecrawl prize in the announce email", () => {
    expect(TOWNS_LAUNCH.render("announce", ctx).text).toContain("The top 5 players each week win 2,500 Firecrawl credits.");
  });

  it("never says Monday or that coding decides the war", () => {
    for (const v of VARIANTS) {
      const e = TOWNS_LAUNCH.render(v, ctx);
      const all = [e.subject, e.preheader, e.text, e.html].join("\n");
      expect(all).not.toMatch(/Monday/);
      expect(all).not.toMatch(/codes? more/);
    }
  });
});
