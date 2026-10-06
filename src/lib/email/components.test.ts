import { describe, expect, it } from "vitest";
import { COLORS, textLink } from "./components";

describe("textLink", () => {
  it("renders a muted line with an escaped lime link", () => {
    const html = textLink("How scoring & checks work", "https://thegitcity.com/towns/rules?a=1&b=2");
    expect(html).toContain('href="https://thegitcity.com/towns/rules?a=1&amp;b=2"');
    expect(html).toContain("How scoring &amp; checks work");
    expect(html).toContain(`color:${COLORS.lime}`);
    expect(html).toContain(`color:${COLORS.muted}`);
    expect(html).toContain("font-size:14px");
  });

  it("is wrapped for Gmail dark mode", () => {
    expect(textLink("x", "https://thegitcity.com")).toMatch(/^<div class="gb-screen"><div class="gb-diff">/);
  });
});
