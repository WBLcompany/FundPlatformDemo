import type { ReactNode } from "react";
import { cn } from "../cn";
import { t } from "../i18n";

export type Column<Row> = { key: string; header: string; cell: (row: Row) => ReactNode; mono?: boolean; className?: string };

export function Table<Row>({ columns, rows, rowKey, caption, empty }: { columns: Column<Row>[]; rows: Row[]; rowKey: (r: Row) => string; caption: string; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface">
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-sunken">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="h-12 px-3 text-start font-medium text-text">{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-text-muted">{empty ?? t("common.empty")}</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={rowKey(r)} className="h-12 border-t border-border">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 text-start text-text", c.mono && "font-mono", c.className)}>{c.cell(r)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
