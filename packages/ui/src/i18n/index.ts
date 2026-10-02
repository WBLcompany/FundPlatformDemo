import ar from "./ar.json";
import views from "./views.ar.json";

export type Messages = { [k: string]: string | Messages };

/** Looks up a dotted key and interpolates {vars}. A missing key returns the key itself so it is visible, never blank. */
export function createT(messages: Messages) {
  return function t(key: string, vars?: Record<string, string | number>): string {
    let node: string | Messages | undefined = messages;
    for (const part of key.split(".")) {
      node = typeof node === "object" && node ? node[part] : undefined;
    }
    if (typeof node !== "string") return key;
    return vars ? node.replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v] ?? `{${v}}`)) : node;
  };
}

export const uiMessages = { ...(ar as Messages), views: views as Messages } as Messages;
export const t = createT(uiMessages);
