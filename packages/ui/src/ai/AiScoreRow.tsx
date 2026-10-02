"use client";
import { EvidenceChip } from "./Evidence";
import { t } from "../i18n";
import type { Evidence } from "./types";

export type ScoreRow = {
  criterion: string;
  weight: number;
  max: number;
  manih: { score: number; rationale: string; evidence: Evidence[] } | null; // null: hidden (independent mode) or AI off
  human: number | null;
};

/**
 * One criterion: Manih's score, rationale, evidence, the specialist's score and the difference.
 * In independent mode the server returns manih = null until the specialist records their own
 * assessment — the hiding is in the database (R-039), this row only renders what it is given.
 */
export function AiScoreRow({ row, hiddenReason, aiEnabled = true, onHumanChange, onEvidence }: {
  row: ScoreRow;
  hiddenReason?: "independent" | null;
  aiEnabled?: boolean;
  onHumanChange?: (score: number) => void;
  onEvidence?: (e: Evidence) => void;
}) {
  const diff = row.manih && row.human != null ? row.human - row.manih.score : null;
  const inputId = `score-${row.criterion}`;
  return (
    <tr className="border-t border-border align-top">
      <th scope="row" className="px-3 py-3 text-start font-medium text-text">
        {row.criterion}
        <span className="ms-2 font-mono text-caption text-text-muted">{row.weight}%</span>
      </th>
      {aiEnabled && (
        <td className="px-3 py-3">
          {row.manih ? (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-body text-ai-text">{row.manih.score}/{row.max}</span>
              <p className="text-body-sm text-text">{row.manih.rationale}</p>
              <div className="flex flex-wrap gap-1">{row.manih.evidence.map((e, i) => <EvidenceChip key={i} evidence={e} onOpen={(ev) => onEvidence?.(ev)} />)}</div>
            </div>
          ) : hiddenReason === "independent" ? (
            <span className="text-body-sm text-text-muted">{t("ai.score.hidden")}</span>
          ) : null}
        </td>
      )}
      <td className="px-3 py-3">
        {onHumanChange ? (
          <>
            <label htmlFor={inputId} className="sr-only">{t("ai.score.human")} — {row.criterion}</label>
            <input
              id={inputId}
              type="number"
              inputMode="numeric"
              min={0}
              max={row.max}
              value={row.human ?? ""}
              onChange={(e) => onHumanChange(Number(e.target.value))}
              className="w-20 rounded-sm border border-border px-2 py-1 font-mono focus:outline-2 focus:outline-focus"
            />
          </>
        ) : (
          <span className="font-mono text-body">{row.human == null ? "—" : `${row.human}/${row.max}`}</span>
        )}
      </td>
      {aiEnabled && (
        <td className="px-3 py-3 font-mono text-body-sm">
          {diff == null ? "—" : <span className={Math.abs(diff) > 1 ? "font-bold text-danger-text" : "text-text"}>{diff > 0 ? `+${diff}` : diff}</span>}
        </td>
      )}
    </tr>
  );
}

export function AiScoreTable({ rows, aiEnabled = true, hiddenReason, onHumanChange, onEvidence, caption }: {
  rows: ScoreRow[];
  aiEnabled?: boolean;
  hiddenReason?: "independent" | null;
  onHumanChange?: (criterion: string, score: number) => void;
  onEvidence?: (e: Evidence) => void;
  caption: string;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface">
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-sunken">
          <tr>
            <th scope="col" className="h-12 px-3 text-start font-medium">{t("ai.score.criterion")}</th>
            {aiEnabled && <th scope="col" className="h-12 px-3 text-start font-medium">{t("ai.score.manih")}</th>}
            <th scope="col" className="h-12 px-3 text-start font-medium">{t("ai.score.human")}</th>
            {aiEnabled && <th scope="col" className="h-12 px-3 text-start font-medium">{t("ai.score.diff")}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <AiScoreRow key={r.criterion} row={r} aiEnabled={aiEnabled} hiddenReason={hiddenReason}
              onHumanChange={onHumanChange ? (s) => onHumanChange(r.criterion, s) : undefined} onEvidence={onEvidence} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
