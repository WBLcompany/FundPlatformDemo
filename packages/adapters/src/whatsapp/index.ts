/** R-103: WhatsApp reminders through approved templates only. */
export interface WhatsAppSender { readonly name: string; sendTemplate(phone: string, template: string, params: string[]): Promise<void> }

export class MemoryWhatsAppSender implements WhatsAppSender {
  readonly name = "whatsapp-memory";
  readonly sent: Array<{ phone: string; template: string; params: string[] }> = [];
  async sendTemplate(phone: string, template: string, params: string[]) { this.sent.push({ phone, template, params }); }
}

export class MetaWhatsAppSender implements WhatsAppSender {
  readonly name = "whatsapp-meta";
  constructor(private readonly phoneNumberId: string, private readonly token: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async sendTemplate(phone: string, template: string, params: string[]) {
    const res = await this.fetchImpl(`https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone.replace(/^\+/, ""), type: "template", template: { name: template, language: { code: "ar" }, components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }] } }),
    });
    if (!res.ok) throw new Error(`whatsapp ${res.status}`);
  }
}
