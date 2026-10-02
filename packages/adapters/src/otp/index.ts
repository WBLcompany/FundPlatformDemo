import { createHash, randomInt } from "node:crypto";

/**
 * R-010 / R-113: the verification-code channel. The platform generates and
 * hashes the code (iam.otp_*); the adapter only delivers it. Swappable:
 * Authentica in production, a mock that records messages in dev and tests.
 */
export interface OtpSender {
  readonly name: string;
  send(phone: string, code: string, purpose: string): Promise<void>;
}

export function generateCode(): string { return String(randomInt(0, 1_000_000)).padStart(6, "0"); }
export function hashCode(code: string, salt: string): string { return createHash("sha256").update(`${salt}:${code}`).digest("hex"); }

export class MockOtpSender implements OtpSender {
  readonly name = "otp-mock";
  readonly sent: Array<{ phone: string; code: string; purpose: string; at: Date }> = [];
  async send(phone: string, code: string, purpose: string) { this.sent.push({ phone, code, purpose, at: new Date() }); }
  last(phone?: string) { return [...this.sent].reverse().find((s) => !phone || s.phone === phone); }
}

export class AuthenticaOtpSender implements OtpSender {
  readonly name = "otp-authentica";
  constructor(private readonly apiKey: string, private readonly baseUrl = "https://api.authentica.sa", private readonly fetchImpl: typeof fetch = fetch) {}
  async send(phone: string, code: string, purpose: string) {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/send-otp`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-authorization": this.apiKey },
      body: JSON.stringify({ method: "sms", phone, otp: code, template_id: purpose }),
    });
    if (!res.ok) throw new Error(`authentica ${res.status}`);
  }
}
