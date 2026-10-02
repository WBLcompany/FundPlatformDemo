// Local ESLint rules that enforce the platform invariants in CLAUDE.md.
// Kept in-repo (no third-party boundary plugin) so a rule's behaviour is
// readable in one file and cannot drift with an upstream major version.
import path from "node:path";

const DOMAIN_ROOT = path.join("packages", "domain", "src");
const FRAMEWORK_IMPORTS = /^(next|react|react-dom|pg|@supabase\/|node:)/;

function contextOf(file) {
  const rel = file.split(path.sep).join("/");
  const m = rel.match(/packages\/domain\/src\/([^/]+)\//);
  return m ? m[1] : null;
}

/** packages/domain/src/<ctx>/** may reach another context only through its index. */
const moduleBoundaries = {
  meta: { type: "problem", schema: [], messages: {
    deep: "Context '{{from}}' may import '{{to}}' only through its public index (@wbl/domain/{{to}}).",
    framework: "packages/domain and packages/rules must stay framework-free; '{{name}}' is not allowed here.",
  } },
  create(context) {
    const file = context.filename;
    const rel = file.split(path.sep).join("/");
    const inDomain = rel.includes("packages/domain/src/");
    const inRules = rel.includes("packages/rules/src/");
    const from = contextOf(file);
    return {
      ImportDeclaration(node) {
        const name = String(node.source.value);
        if ((inDomain || inRules) && FRAMEWORK_IMPORTS.test(name) && name !== "node:crypto") {
          context.report({ node, messageId: "framework", data: { name } });
        }
        if (!inDomain || !from) return;
        if (name.startsWith(".")) {
          const target = path.resolve(path.dirname(file), name).split(path.sep).join("/");
          const m = target.match(/packages\/domain\/src\/([^/]+)(\/(.*))?$/);
          if (m && m[1] !== from && m[3] && m[3] !== "index" && m[3] !== "index.ts") {
            context.report({ node, messageId: "deep", data: { from, to: m[1] } });
          }
        }
        const pkg = name.match(/^@wbl\/domain\/([^/]+)\/(.+)$/);
        if (pkg && pkg[1] !== from) {
          context.report({ node, messageId: "deep", data: { from, to: pkg[1] } });
        }
      },
    };
  },
};

/** Invariant 3: no service_role in application code. */
const noServiceRole = {
  meta: { type: "problem", schema: [], messages: {
    banned: "service_role is not allowed in application code (CLAUDE.md invariant 3).",
  } },
  create(context) {
    const check = (node, value) => {
      if (typeof value === "string" && /service[_-]?role/i.test(value)) {
        context.report({ node, messageId: "banned" });
      }
    };
    return {
      Literal(node) { check(node, node.value); },
      TemplateElement(node) { check(node, node.value.raw); },
      Identifier(node) { check(node, node.name); },
    };
  },
};

/** UI rule: no hex colours inside components; use tokens. */
const noHexInComponents = {
  meta: { type: "problem", schema: [], messages: {
    hex: "Hard-coded colour '{{value}}' — use a design token (CLAUDE.md, الواجهة).",
  } },
  create(context) {
    const re = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/;
    const check = (node, value) => {
      if (typeof value !== "string") return;
      const m = value.match(re);
      if (m && /(bg|text|border|fill|stroke|color|ring|from|to|via)[-:\[]|^#/.test(value)) {
        context.report({ node, messageId: "hex", data: { value: m[0] } });
      }
    };
    return {
      Literal(node) { check(node, node.value); },
      TemplateElement(node) { check(node, node.value.raw); },
    };
  },
};

/** RTL rule: physical direction utilities are banned; use logical ones. */
const logicalProperties = {
  meta: { type: "problem", schema: [], messages: {
    physical: "Physical direction class '{{cls}}' — use the logical one (ms-/me-/ps-/pe-/start-/end-/text-start/text-end).",
  } },
  create(context) {
    const re = /(?:^|[\s"'`:])(-?(?:ml|mr|pl|pr|left|right|rounded-l|rounded-r|border-l|border-r|text-left|text-right|float-left|float-right)(?:-[\w.[\]/]+)?)(?=$|[\s"'`])/;
    const check = (node, value) => {
      if (typeof value !== "string") return;
      const m = value.match(re);
      if (m) context.report({ node, messageId: "physical", data: { cls: m[1] } });
    };
    return {
      JSXAttribute(node) {
        if (node.name?.name !== "className" || !node.value) return;
        if (node.value.type === "Literal") check(node, node.value.value);
      },
    };
  },
};

/**
 * Every UI string comes from the messages file (apps/web/messages/ar.json). Flags string literals,
 * template text and JSX text that contain Arabic letters. Arabic punctuation alone («،») and a
 * single letter (an enum code such as the أ–د performance rating) are allowed.
 */
const noArabicLiterals = {
  meta: { type: "problem", schema: [], messages: {
    literal: "Arabic text in code: move it to messages/ar.json and use t().",
  } },
  create(context) {
    const letters = /[\u0621-\u064A]/g;
    const check = (node, value) => {
      if (typeof value !== "string") return;
      const n = (value.match(letters) ?? []).length;
      if (n >= 2) context.report({ node, messageId: "literal" });
    };
    return {
      Literal(node) { if (node.regex) check(node, node.regex.pattern); else check(node, node.value); },
      TemplateElement(node) { check(node, node.value.cooked); },
      JSXText(node) { check(node, node.value); },
    };
  },
};

export default {
  rules: {
    "no-arabic-literals": noArabicLiterals,
    "module-boundaries": moduleBoundaries,
    "no-service-role": noServiceRole,
    "no-hex-in-components": noHexInComponents,
    "logical-properties": logicalProperties,
  },
};
