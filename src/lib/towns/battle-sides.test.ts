import { describe, expect, it } from "vitest";
import { battleLead, closedSide, liveSide, resultLine, scoreShare, topPlayers } from "./battle-sides";
import { sideDays, type PlayEntry, type PlaySideResult } from "./play-score";

const NAMES: [string, string] = ["Claude", "Codex"];
const FORBIDDEN = /per dev|coding|coded/i;

let id = 0;
// Task 7's shape: `daily` is points per day Mon..Sun, `days` is how many days scored.
function entry(login: string, side: PlayEntry["side"], total: number, counted = true): PlayEntry {
  id += 1;
  return {
    developer_id: id,
    login,
    avatar_url: null,
    side,
    total,
    daily: [total, 0, 0, 0, 0, 0, 0],
    days: total > 0 ? 1 : 0,
    counted,
  } as unknown as PlayEntry;
}

// Claude: 3 counted scorers (100, 80, 60) and one alt that maxed every day.
// Codex: 2 counted scorers, so no score. A non-war player scores for nobody.
const ENTRIES: PlayEntry[] = [
  entry("alt", "claude", 2000, false),
  entry("a", "claude", 100),
  entry("b", "claude", 80),
  entry("c", "claude", 60),
  entry("z", "claude", 0),
  entry("d", "codex", 50),
  entry("e", "codex", 40),
  entry("x", null, 999),
];

describe("liveSide", () => {
  it("averages the counted scorers and has no team bonus before the close", () => {
    const s = liveSide(ENTRIES, "claude");
    expect(s.perPlayer).toBe(80);
    expect(s.scorers).toBe(3);
    expect(s.bonus).toBe(0);
    expect(s.score).toBe(80);
    expect(s.days).toEqual(sideDays(ENTRIES, "claude"));
    expect(s.days).toHaveLength(7);
  });

  it("has no score under 3 scorers", () => {
    const s = liveSide(ENTRIES, "codex");
    expect(s.perPlayer).toBeNull();
    expect(s.score).toBeNull();
    expect(s.scorers).toBe(2);
  });
});

describe("topPlayers", () => {
  it("lists the side's counted scorers by points, never an alt or a non-war player", () => {
    expect(topPlayers(ENTRIES, "claude").map((p) => p.login)).toEqual(["a", "b", "c"]);
    expect(topPlayers(ENTRIES, "codex").map((p) => p.total)).toEqual([50, 40]);
  });
});

describe("closedSide", () => {
  it("takes the score as the close froze it, team bonus included", () => {
    const war: PlaySideResult = { perPlayer: 80, scorers: 3, bonus: 25, score: 105 };
    const s = closedSide(war, ENTRIES, "claude");
    expect(s).toMatchObject({ perPlayer: 80, scorers: 3, bonus: 25, score: 105 });
    expect(s.days).toEqual(sideDays(ENTRIES, "claude"));
    expect(s.top.map((p) => p.login)).toEqual(["a", "b", "c"]);
  });
});

describe("poster score lines", () => {
  const view = (claude: number | null, codex: number | null, showing: "live" | "result" = "live") => ({
    showing,
    sides: { claude: { score: claude }, codex: { score: codex } },
  });

  it("leads, wins and ties per player", () => {
    expect(battleLead(view(105, 95), NAMES)).toBe("Claude leads · 105 vs 95 per player");
    expect(battleLead(view(90, 120, "result"), NAMES)).toBe("Codex won · 120 vs 90 per player");
    expect(battleLead(view(70, 70), NAMES)).toBe("Dead even · 70 per player");
  });

  it("says who still needs 3 players", () => {
    expect(battleLead(view(null, null), NAMES)).toBe("Nobody has 3 players yet");
    expect(battleLead(view(null, 40), NAMES)).toBe("Claude needs 3 players to score");
    expect(battleLead(view(40, null), NAMES)).toBe("Codex needs 3 players to score");
  });

  it("names last week's result per player", () => {
    expect(resultLine({ number: 1, winner: "claude", claude: 120, codex: 95 }, NAMES)).toBe("Claude won week 1\u00a0· 120 vs 95 per player");
    expect(resultLine({ number: 2, winner: null, claude: null, codex: null }, NAMES)).toBe("Week 2 was a tie\u00a0· – vs – per player");
    expect(resultLine(null, NAMES)).toBeNull();
  });

  it("splits the bar by score, even at nothing", () => {
    expect(scoreShare(view(75, 25))).toBe(0.75);
    expect(scoreShare(view(null, null))).toBe(0.5);
  });

  it("never says contributions decide the war", () => {
    const lines = [
      battleLead(view(105, 95), NAMES),
      battleLead(view(null, null), NAMES),
      battleLead(view(null, 4), NAMES),
      resultLine({ number: 1, winner: "codex", claude: 1, codex: 2 }, NAMES),
    ];
    for (const l of lines) expect(l).not.toMatch(FORBIDDEN);
  });
});
