import { HttpManihClient, MockManihClient, type ManihClient } from "./manih";
import { AuthenticaOtpSender, MockOtpSender, type OtpSender } from "./otp";
import { HttpEntitiesRegistry, MockEntitiesRegistry, type EntitiesRegistry } from "./entities";
import { HttpEmailSender, MemoryEmailSender, type EmailSender } from "./email";
import { MemoryWhatsAppSender, MetaWhatsAppSender, type WhatsAppSender } from "./whatsapp";
import { LocalStorage, type ObjectStorage } from "./storage";
import { ClamdScanner, MockScanner, type VirusScanner } from "./av";
import { GotenbergDocGenerator, HtmlDocGenerator, type DocGenerator } from "./docgen";

export type Adapters = { manih: ManihClient; otp: OtpSender; entities: EntitiesRegistry; email: EmailSender; whatsapp: WhatsAppSender; storage: ObjectStorage; av: VirusScanner; docgen: DocGenerator };

/**
 * One place decides real vs mock, from environment only. Development never
 * reaches an external service unless its variables are set on purpose
 * ("لا ترسل بيانات حقيقية لأي خدمة خارجية من بيئة التطوير").
 */
export function createAdapters(env: Record<string, string | undefined>): Adapters {
  const secret = env.MANIH_WEBHOOK_SECRET ?? "dev-manih-secret";
  return {
    manih: env.MANIH_URL && env.MANIH_API_KEY ? new HttpManihClient(env.MANIH_URL, env.MANIH_API_KEY) : new MockManihClient({ secret, mode: (env.MANIH_MOCK_MODE as "ok" | "fail" | "invalid") ?? "ok" }),
    otp: env.AUTHENTICA_API_KEY ? new AuthenticaOtpSender(env.AUTHENTICA_API_KEY) : new MockOtpSender(),
    entities: env.ENTITIES_URL && env.ENTITIES_API_KEY ? new HttpEntitiesRegistry(env.ENTITIES_URL, env.ENTITIES_API_KEY) : new MockEntitiesRegistry(),
    email: env.EMAIL_API_URL && env.EMAIL_API_KEY ? new HttpEmailSender(env.EMAIL_API_URL, env.EMAIL_API_KEY, env.EMAIL_FROM ?? "no-reply@wbl.sa") : new MemoryEmailSender(),
    whatsapp: env.WHATSAPP_PHONE_ID && env.WHATSAPP_TOKEN ? new MetaWhatsAppSender(env.WHATSAPP_PHONE_ID, env.WHATSAPP_TOKEN) : new MemoryWhatsAppSender(),
    storage: new LocalStorage(env.STORAGE_ROOT ?? ".storage"),
    av: env.CLAMD_HOST ? new ClamdScanner(env.CLAMD_HOST, Number(env.CLAMD_PORT ?? 3310)) : new MockScanner(),
    docgen: env.GOTENBERG_URL ? new GotenbergDocGenerator(env.GOTENBERG_URL) : new HtmlDocGenerator(),
  };
}
