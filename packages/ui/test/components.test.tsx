import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Alert, Button, Drawer, PortalHeader, SelectField, Sidebar, StatusBadge, Table, Tabs, TextField } from "../src";
import { EntityPage, EntityRef } from "../src/entity";
import { criticalViolations } from "./axe";

describe("N-10 base components", () => {
  it("N-10 a full gallery has no critical axe violations in RTL", async () => {
    const { container } = render(
      <div dir="rtl" lang="ar">
        <main>
          <Button variant="primary">أرسل الطلب</Button>
          <Button>احفظ</Button>
          <TextField label="رقم الترخيص" hint="عشرة أرقام" required />
          <TextField label="البريد" error="صيغة البريد غير صحيحة" />
          <SelectField label="البرنامج" options={[{ value: "a", label: "تمكين الأسر" }]} />
          <StatusBadge tone="late" />
          <Alert tone="warning" title="الوثيقة تقترب من الانتهاء">بعد ١٠ أيام</Alert>
          <Table caption="الطلبات" rowKey={(r) => r.id} rows={[{ id: "1", n: "ط-2026-0417" }]} columns={[{ key: "n", header: "الرقم", cell: (r) => r.n, mono: true }]} />
          <Tabs tabs={[{ id: "a", label: "الملخص", content: <p>أ</p> }, { id: "b", label: "المرفقات", content: <p>ب</p> }]} />
        </main>
        <Sidebar brand={<span>وبل</span>} items={[{ href: "/tasks", label: "مهامي", icon: "tasks", active: true }]} />
        <PortalHeader donorName="مؤسسة نورة الملاحي" items={[{ href: "/", label: "لوحتي", icon: "tasks", active: true }]} />
      </div>,
    );
    expect(await criticalViolations(container)).toEqual([]);
  });

  it("N-10 status badges carry a word, never colour alone", () => {
    render(<StatusBadge tone="done" />);
    expect(screen.getByText("مكتمل")).toBeTruthy();
  });

  it("N-10 a field error is announced and linked to its input", () => {
    render(<TextField label="البريد" error="صيغة البريد غير صحيحة" />);
    const input = screen.getByLabelText("البريد");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)?.textContent).toBe("صيغة البريد غير صحيحة");
  });

  it("N-10 tabs move forward with ArrowLeft in RTL", () => {
    render(<div dir="rtl"><Tabs tabs={[{ id: "a", label: "أ", content: "1" }, { id: "b", label: "ب", content: "2" }]} /></div>);
    fireEvent.keyDown(screen.getByRole("tab", { name: "أ" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "ب" }).getAttribute("aria-selected")).toBe("true");
  });

  it("N-10 the drawer is a labelled modal dialog and closes on Escape", () => {
    let open = true;
    const { rerender } = render(<Drawer open={open} onClose={() => { open = false; }} title="الدليل">x</Drawer>);
    expect(screen.getByRole("dialog", { name: "الدليل" }).getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    rerender(<Drawer open={open} onClose={() => {}} title="الدليل">x</Drawer>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("R-097 entity references and template", () => {
  it("R-097 a viewer without permission sees the name with no link", () => {
    render(<EntityRef entity={{ kind: "association", id: "1", label: "جمعية نماء", href: null }} />);
    expect(screen.getByText("جمعية نماء").closest("a")).toBeNull();
  });
  it("R-097 a viewer with permission gets a link", () => {
    render(<EntityRef entity={{ kind: "association", id: "1", label: "جمعية نماء", href: "/associations/1" }} />);
    expect(screen.getByText("جمعية نماء").closest("a")?.getAttribute("href")).toBe("/associations/1");
  });
  it("R-097 the template renders header, brief and activity", async () => {
    const { container } = render(
      <div dir="rtl" lang="ar"><main>
        <EntityPage kind="مشروع" title="مطبخ إنتاجي" reference="م-2026-0031" status={{ tone: "active", label: "قيد التنفيذ" }}
          brief={{ status: "ready", outputId: "b", value: { now: "الدفعة الأولى صُرفت", waiting: "ينتظر التسليم الثاني" } }}
          facts={[{ label: "المبلغ", value: "350,000" }]}
          activity={[{ id: "1", at: "2026-10-01T10:00:00Z", atLabel: "١ أكتوبر", actor: "سارة", text: "قبلت التسليم" }]}>
          <p>المحتوى</p>
        </EntityPage>
      </main></div>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "مطبخ إنتاجي" })).toBeTruthy();
    expect(screen.getByText("الخلاصة الآن")).toBeTruthy();
    expect(screen.getByText("قبلت التسليم", { exact: false })).toBeTruthy();
    expect(await criticalViolations(container)).toEqual([]);
  });
});
