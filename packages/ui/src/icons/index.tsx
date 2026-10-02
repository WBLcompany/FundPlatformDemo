// TODO-ICON: every glyph here is a temporary stand-in until WBL's official
// pixel icon library arrives (docs/04-design-system.md, appendix A). Each
// renders data-todo-icon so a release check can find and refuse them (T-63).
import type { SVGProps } from "react";

const paths: Record<string, string> = {
  tasks: "M4 6h16M4 12h16M4 18h10",
  applications: "M6 3h9l3 3v15H6z M9 9h6 M9 13h6",
  projects: "M3 7h18v12H3z M8 7V4h8v3",
  associations: "M4 20V8l8-4 8 4v12 M9 20v-6h6v6",
  suppliers: "M3 17h18 M5 17V9h14v8 M8 9V6h8v3",
  disbursement: "M3 7h18v10H3z M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  reports: "M5 20V10 M12 20V4 M19 20v-7",
  settings: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3",
  search: "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14 M20 20l-4-4",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4z M10 20h4",
  upload: "M12 16V4 M7 9l5-5 5 5 M4 20h16",
  file: "M6 3h9l3 3v15H6z",
  download: "M12 4v12 M7 11l5 5 5-5 M4 20h16",
  calendar: "M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4",
  user: "M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M4 21c1-4 4-6 8-6s7 2 8 6",
  team: "M8 6a3 3 0 1 0 0 6a3 3 0 1 0 0-6 M16 8a3 3 0 1 0 0 6 M2 20c1-3 3-5 6-5s5 2 6 5 M14 20c.5-2 2-4 4-4s3 1 4 4",
  lock: "M6 11h12v9H6z M8 11V7a4 4 0 0 1 8 0v4",
  mail: "M3 6h18v12H3z M3 6l9 7 9-7",
  check: "M5 12l5 5 9-10",
  error: "M12 3l9 16H3z M12 9v5 M12 16v1",
  warning: "M12 3l9 16H3z M12 9v5 M12 16v1",
  info: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 10v6 M12 7v1",
  arrowStart: "M15 6l-6 6 6 6",
  arrowEnd: "M9 6l6 6-6 6",
  plus: "M12 5v14 M5 12h14",
  edit: "M4 20h4l10-10-4-4L4 16z",
  trash: "M5 7h14 M9 7V4h6v3 M7 7l1 13h8l1-13",
  filter: "M4 5h16l-6 8v6l-4-2v-4z",
  close: "M6 6l12 12 M18 6L6 18",
  link: "M10 14l4-4 M8 16l-2 2a3 3 0 0 1-4-4l4-4 M16 8l2-2a3 3 0 0 1 4 4l-4 4",
  history: "M4 12a8 8 0 1 0 3-6 M4 4v4h4 M12 8v4l3 2",
  evidence: "M6 3h9l3 3v15H6z M9 13l2 2 4-4",
  ai: "M4 4h4v4H4z M10 4h4v4h-4z M16 10h4v4h-4z M10 16h4v4h-4z M4 16h4v4H4z",
  committee: "M3 20h18 M5 20V10 M10 20V10 M14 20V10 M19 20V10 M2 10l10-6 10 6",
  sign: "M3 18c3-6 5-6 6-3s3 3 5-1 M14 20h7",
  money: "M3 7h18v10H3z M7 12h.01 M17 12h.01",
  deliverable: "M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10",
  menu: "M4 6h16 M4 12h16 M4 18h16",
};

export type IconName = keyof typeof paths;
export const iconNames = Object.keys(paths) as IconName[];

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const flip = name === "arrowStart" || name === "arrowEnd";
  return (
    <svg
      data-todo-icon={name}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      className={flip ? "rtl:-scale-x-100" : undefined}
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
