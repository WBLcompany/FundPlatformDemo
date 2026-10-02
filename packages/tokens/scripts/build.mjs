// design/tokens.json (W3C) → Tailwind v4 theme CSS + a typed TS map.
// The JSON stays the single source; Figma reads the same file via Tokens Studio.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const src = JSON.parse(readFileSync(path.join(root, "design/tokens.json"), "utf8"));
const outDir = path.resolve(here, "../src/generated");

export function flatten(node, prefix = [], out = {}) {
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith("$")) continue;
    if (v && typeof v === "object" && "$value" in v) out[[...prefix, k].join(".")] = v;
    else if (v && typeof v === "object") flatten(v, [...prefix, k], out);
  }
  return out;
}

export function resolve(flat, value, seen = new Set()) {
  if (typeof value === "string" && /^\{[^}]+\}$/.test(value)) {
    const ref = value.slice(1, -1);
    if (seen.has(ref)) throw new Error(`token cycle at ${ref}`);
    const t = flat[ref];
    if (!t) throw new Error(`unknown token reference ${ref}`);
    seen.add(ref);
    return resolve(flat, t.$value, seen);
  }
  return value;
}

export function build(json) {
  const flat = flatten(json);
  const resolved = {};
  for (const [k, t] of Object.entries(flat)) resolved[k] = resolve(flat, t.$value);

  const cssName = (k) => {
    const parts = k.split(".");
    const [group, ...rest] = parts;
    if (group === "color") {
      // color.brand.deep-green → --color-deep-green ; color.semantic.text → --color-text
      // color.neutral.50 → --color-neutral-50 ; color.ink.choral → --color-ink-choral ; color.chart.1 → --color-chart-1
      const [sub, ...name] = rest;
      if (sub === "brand" || sub === "secondary" || sub === "semantic") return `--color-${name.join("-")}`;
      return `--color-${sub}-${name.join("-")}`;
    }
    if (group === "font" && rest[0] === "family") return `--font-${rest[1]}`;
    if (group === "font" && rest[0] === "size") return `--text-${rest[1]}`;
    if (group === "font" && rest[0] === "line-height") return `--text-${rest[1]}--line-height`;
    if (group === "font" && rest[0] === "weight") return `--font-weight-${rest[1]}`;
    if (group === "radius") return `--radius-${rest[0]}`;
    if (group === "shadow") return `--shadow-${rest[0]}`;
    if (group === "space") return `--space-${rest[0]}`;
    return `--${parts.join("-")}`;
  };
  const cssValue = (v) => {
    if (Array.isArray(v)) return v.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(", ");
    if (v && typeof v === "object" && "blur" in v) return `${v.offsetX} ${v.offsetY} ${v.blur} ${v.spread} ${v.color}`;
    return String(v);
  };

  const lines = Object.keys(resolved).sort().map((k) => `  ${cssName(k)}: ${cssValue(resolved[k])};`);
  const css = [
    "/* GENERATED from design/tokens.json by packages/tokens/scripts/build.mjs — do not edit. */",
    "@theme {",
    "  /* Only WBL tokens exist: Tailwind's default palette is removed so a raw stone-500 cannot be typed. */",
    "  --color-*: initial;",
    "  --spacing: 4px;",
    ...lines,
    "}",
    "",
  ].join("\n");

  const ts = [
    "// GENERATED from design/tokens.json — do not edit.",
    `export const tokens = ${JSON.stringify(resolved, null, 2)} as const;`,
    "export type TokenName = keyof typeof tokens;",
    "",
  ].join("\n");
  return { css, ts, resolved };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { css, ts } = build(src);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "theme.css"), css);
  writeFileSync(path.join(outDir, "tokens.ts"), ts);
  console.log("tokens: wrote theme.css and tokens.ts");
}
