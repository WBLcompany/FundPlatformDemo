/**
 * Agreement and letter generation (R-048, N-13). Templates are HTML with
 * {{placeholders}} (D-14); Gotenberg turns them into PDF when configured, and
 * the HTML itself is returned otherwise (dev). Values are escaped: a field
 * from an application can never inject markup into a contract.
 */
export interface DocGenerator { readonly name: string; render(html: string): Promise<{ body: Uint8Array; mime: string; ext: string }> }

export function fillTemplate(tpl: string, values: Record<string, string | number>): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => (k in values ? esc(String(values[k])) : `{{${k}}}`));
}

export function missingPlaceholders(filled: string): string[] {
  return [...filled.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]!);
}

export class HtmlDocGenerator implements DocGenerator {
  readonly name = "docgen-html";
  async render(html: string) { return { body: new TextEncoder().encode(html), mime: "text/html; charset=utf-8", ext: "html" }; }
}

export class GotenbergDocGenerator implements DocGenerator {
  readonly name = "docgen-gotenberg";
  constructor(private readonly url: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async render(html: string) {
    const form = new FormData();
    form.append("files", new Blob([html], { type: "text/html" }), "index.html");
    const res = await this.fetchImpl(`${this.url}/forms/chromium/convert/html`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`gotenberg ${res.status}`);
    return { body: new Uint8Array(await res.arrayBuffer()), mime: "application/pdf", ext: "pdf" };
  }
}

export const AGREEMENT_TEMPLATE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
body{font-family:"Ko Sans",Tahoma,sans-serif;line-height:1.9;color:#063524;margin:48px}h1{font-size:22px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #D3DCD7;padding:6px 10px;text-align:right}.mono{font-family:"IBM Plex Mono",monospace;direction:ltr;unicode-bidi:embed}
</style></head><body>
<h1>اتفاقية منحة رقم <span class="mono">{{agreementRef}}</span></h1>
<p>حُررت هذه الاتفاقية بتاريخ {{issuedHijri}} الموافق {{issuedGregorian}} بين:</p>
<p><strong>الطرف الأول:</strong> {{donorName}}.<br><strong>الطرف الثاني:</strong> {{associationName}}، ترخيص رقم <span class="mono">{{licenseNo}}</span>.</p>
<p>اتفق الطرفان على منح الطرف الثاني مبلغ <span class="mono">{{amount}}</span> ريال لتنفيذ مشروع «{{projectTitle}}» وفق الطلب رقم <span class="mono">{{applicationRef}}</span>، بموجب نسخة الإطار <span class="mono">{{frameworkVersion}}</span>.</p>
<h2>جدول الدفعات والتسليمات</h2>
{{scheduleTable}}
<p>يلتزم الطرف الثاني بالتسليمات في مواعيدها، وبرفع مستند استلام لكل دفعة خلال المدة المحددة.</p>
<p>توقيع الطرف الأول: ____________ &nbsp;&nbsp;&nbsp; توقيع الطرف الثاني (صاحب الصلاحية): ____________</p>
</body></html>`;
