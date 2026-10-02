import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
// @ts-expect-error — plain .mjs build script, no types
import { build } from "../scripts/build.mjs";
import { contrast, tokens } from "../src";

const root = path.resolve(__dirname, "../../..");
const json = JSON.parse(readFileSync(path.join(root, "design/tokens.json"), "utf8"));

describe("design tokens", () => {
  it("generated files are in sync with design/tokens.json", () => {
    const { css, ts } = build(json);
    expect(readFileSync(path.join(__dirname, "../src/generated/theme.css"), "utf8")).toBe(css);
    expect(readFileSync(path.join(__dirname, "../src/generated/tokens.ts"), "utf8")).toBe(ts);
  });

  it("removes Tailwind's default palette so only WBL colours exist", () => {
    const { css } = build(json);
    expect(css).toContain("--color-*: initial;");
  });

  // Pairs the design system documents as text-on-background (docs/04-design-system.md §2.4).
  const t = tokens as Record<string, string>;
  const pairs: Array<[string, string, string]> = [
    ["text on bg", "color.semantic.text", "color.semantic.bg"],
    ["text on surface", "color.semantic.text", "color.semantic.surface"],
    ["muted on surface", "color.semantic.text-muted", "color.semantic.surface"],
    ["primary button text", "color.semantic.action-text", "color.semantic.action"],
    ["AI badge", "color.semantic.ai-text", "color.semantic.ai-bg"],
    ["danger", "color.semantic.danger-text", "color.semantic.danger-bg"],
    ["warning", "color.semantic.warning-text", "color.semantic.warning-bg"],
    ["success", "color.semantic.text", "color.semantic.success-bg"],
    ["info", "color.semantic.text", "color.semantic.info-bg"],
    ["link on surface", "color.semantic.link", "color.semantic.surface"],
    ["white on chrome", "color.brand.white", "color.semantic.chrome"],
  ];
  for (const [label, fg, bg] of pairs) {
    it(`N-10 ${label} meets 4.5:1`, () => {
      expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("N-10 Tech Green can never carry text on white", () => {
    expect(contrast(t["color.brand.tech-green"]!, t["color.brand.white"]!)).toBeLessThan(4.5);
  });
});
