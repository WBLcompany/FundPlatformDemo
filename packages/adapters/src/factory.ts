import path from "node:path";
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
/**
 * The web server and the worker must resolve the same file store. A relative root is resolved
 * against each process's working directory (Next's standalone server changes its own), so in
 * production the root must be absolute.
 */
function storageRoot(env: Record<string, string | undefined>): string {
  const root = env.STORAGE_ROOT ?? ".storage";
  if (env.NODE_ENV === "production" && !path.isAbsolute(root)) throw new Error("STORAGE_ROOT must be an absolute path in production");
  return root;
}

export function createAdapters(env: Record<string, string | undefined>): Adapters {
  const secret = env.MANIH_WEBHOOK_SECRET ?? (env.NODE_ENV === "production" ? "" : "dev-manih-secret");
  if (!secret) throw new Error("MANIH_WEBHOOK_SECRET is required in production");
  return {
    manih: env.MANIH_URL && env.MANIH_API_KEY ? new HttpManihClient(env.MANIH_URL, env.MANIH_API_KEY) : new MockManihClient({ secret, mode: (env.MANIH_MOCK_MODE as "ok" | "fail" | "invalid") ?? "ok" }),
    otp: env.AUTHENTICA_API_KEY ? new AuthenticaOtpSender(env.AUTHENTICA_API_KEY) : new MockOtpSender(),
    entities: env.ENTITIES_URL && env.ENTITIES_API_KEY ? new HttpEntitiesRegistry(env.ENTITIES_URL, env.ENTITIES_API_KEY) : new MockEntitiesRegistry(),
    email: env.EMAIL_API_URL && env.EMAIL_API_KEY ? new HttpEmailSender(env.EMAIL_API_URL, env.EMAIL_API_KEY, env.EMAIL_FROM ?? "no-reply@wbl.sa") : new MemoryEmailSender(),
    whatsapp: env.WHATSAPP_PHONE_ID && env.WHATSAPP_TOKEN ? new MetaWhatsAppSender(env.WHATSAPP_PHONE_ID, env.WHATSAPP_TOKEN) : new MemoryWhatsAppSender(),
    storage: new LocalStorage(storageRoot(env)),
    av: env.CLAMD_HOST ? new ClamdScanner(env.CLAMD_HOST, Number(env.CLAMD_PORT ?? 3310)) : new MockScanner(),
    docgen: env.GOTENBERG_URL ? new GotenbergDocGenerator(env.GOTENBERG_URL) : new HtmlDocGenerator(),
  };
}
