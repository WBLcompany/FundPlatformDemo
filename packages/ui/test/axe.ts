import axe from "axe-core";

/** Runs axe on a container and returns only serious/critical violations (the gate in N-10). */
export async function criticalViolations(container: HTMLElement) {
  const res = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id}: ${v.help}`);
}
