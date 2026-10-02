import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AiSuggestion, AiScoreTable, EntityBrief, type AiState, type Evidence } from "../src/ai";
import { criticalViolations } from "./axe";

const ev: Evidence = { fileId: "f1", fileName: "الدراسة.pdf", page: 4, span: { start: 6, end: 12 }, excerpt: "يستهدف ٤٠ أسرة منتجة في الحي" };
const states: Record<string, AiState<string>> = {
  pending: { status: "pending", etaSeconds: 90 },
  ready: { status: "ready", value: "ملخص الطلب", outputId: "o1", evidence: [ev] },
  edited: { status: "edited", value: "ملخص معدّل", original: "ملخص الطلب", outputId: "o1" },
  failed: { status: "failed", reason: "انتهت المهلة" },
  disabled: { status: "disabled" },
};

describe("N-12 AiSuggestion renders all five states", () => {
  for (const [name, state] of Object.entries(states)) {
    it(`N-12 ${name} state has no critical axe violations`, async () => {
      const { container } = render(
        <div dir="rtl" lang="ar">
          <AiSuggestion state={state} render={(v) => <p>{v}</p>} manual={<textarea aria-label="الملخص" />} onAccept={() => {}} onFeedback={() => {}} onManual={() => {}} />
        </div>,
      );
      expect(await criticalViolations(container)).toEqual([]);
    });
  }

  it("N-12 ready output is badged and offers the source", () => {
    render(<AiSuggestion state={states.ready!} render={(v) => <p>{v}</p>} manual={null} onAccept={() => {}} />);
    expect(screen.getByText("مانح")).toBeTruthy();
    expect(screen.getByText("ما مصدر هذا؟")).toBeTruthy();
    expect(screen.getByText("الدراسة.pdf")).toBeTruthy();
  });

  it("R-112 disabled AI shows only the manual control, with no AI marker", () => {
    const { container } = render(<AiSuggestion state={states.disabled!} render={(v) => <p>{v}</p>} manual={<input aria-label="يدوي" />} />);
    expect(container.querySelector("[data-ai-badge]")).toBeNull();
    expect(screen.getByLabelText("يدوي")).toBeTruthy();
  });

  it("N-12 pending offers the manual path immediately", () => {
    const onManual = vi.fn();
    render(<AiSuggestion state={states.pending!} render={(v) => <p>{v}</p>} manual={null} onManual={onManual} />);
    fireEvent.click(screen.getByText("اعمل يدوياً الآن"));
    expect(onManual).toHaveBeenCalled();
  });

  it("N-11 feedback records not-helpful with a reason", () => {
    const onFeedback = vi.fn();
    render(<AiSuggestion state={states.ready!} render={(v) => <p>{v}</p>} manual={null} onFeedback={onFeedback} />);
    fireEvent.click(screen.getByText("غير مفيد"));
    fireEvent.change(screen.getByPlaceholderText("ما السبب؟"), { target: { value: "مبالغة" } });
    fireEvent.click(screen.getByText("أرسل التقييم"));
    expect(onFeedback).toHaveBeenCalledWith({ helpful: false, reason: "مبالغة" });
  });

  it("edited state names who changed it", () => {
    render(<AiSuggestion state={states.edited!} render={(v) => <p>{v}</p>} manual={null} />);
    expect(screen.getByText("عدّلها الأخصائي")).toBeTruthy();
  });
});

describe("AiScoreTable", () => {
  const row = { criterion: "وضوح الاحتياج", weight: 20, max: 5, human: null };
  it("R-039 independent mode shows the hidden notice, never a score", () => {
    render(<AiScoreTable caption="المعايير" hiddenReason="independent" rows={[{ ...row, manih: null }]} />);
    expect(screen.getByText("محجوبة حتى تسجّل تقييمك")).toBeTruthy();
  });
  it("R-034 shows score, rationale and evidence for each criterion", () => {
    render(<AiScoreTable caption="المعايير" rows={[{ ...row, human: 3, manih: { score: 4, rationale: "الاحتياج موثق", evidence: [ev] } }]} />);
    expect(screen.getByText("4/5")).toBeTruthy();
    expect(screen.getByText("الاحتياج موثق")).toBeTruthy();
    expect(screen.getByText("-1")).toBeTruthy();
  });
  it("R-112 AI disabled hides the Manih column entirely", () => {
    render(<AiScoreTable caption="المعايير" aiEnabled={false} rows={[{ ...row, manih: null }]} />);
    expect(screen.queryByText("درجة مانح")).toBeNull();
  });
});

describe("EntityBrief", () => {
  it("R-097 hides the line when AI failed or is disabled", () => {
    const { container: a } = render(<EntityBrief state={{ status: "failed", reason: "x" }} />);
    const { container: b } = render(<EntityBrief state={{ status: "disabled" }} />);
    expect(a.innerHTML).toBe("");
    expect(b.innerHTML).toBe("");
  });
  it("R-097 shows two lines when ready", () => {
    render(<EntityBrief state={{ status: "ready", outputId: "b1", value: { now: "قيد الدراسة", waiting: "ينتظر تقييمك", risk: "يقترب من المهلة" } }} />);
    expect(screen.getByText("قيد الدراسة")).toBeTruthy();
    expect(screen.getByText("ينتظر تقييمك · يقترب من المهلة")).toBeTruthy();
  });
});
