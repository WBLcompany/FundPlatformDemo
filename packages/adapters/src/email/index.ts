/** R-102 / R-094: email. Every message carries an RTL HTML part beside the plain text. */
export type EmailMessage = { to: string; subject: string; text: string };
export interface EmailSender { readonly name: string; send(m: EmailMessage): Promise<void> }

export function rtlHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:Tahoma,sans-serif;line-height:1.8;direction:rtl;text-align:right">${esc.split("\n").map((l) => `<p style="margin:0 0 8px">${l || "&nbsp;"}</p>`).join("")}</body></html>`;
}

export class MemoryEmailSender implements EmailSender {
  readonly name = "email-memory";
  readonly outbox: EmailMessage[] = [];
  async send(m: EmailMessage) { this.outbox.push(m); }
}

/** Generic HTTP provider (Resend-compatible shape). */
export class HttpEmailSender implements EmailSender {
  readonly name = "email-http";
  constructor(private readonly url: string, private readonly apiKey: string, private readonly from: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async send(m: EmailMessage) {
    const res = await this.fetchImpl(this.url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify({ from: this.from, to: m.to, subject: m.subject, text: m.text, html: rtlHtml(m.text) }) });
    if (!res.ok) throw new Error(`email ${res.status}`);
  }
}
