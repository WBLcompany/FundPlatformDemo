import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Envelope-style field encryption (architecture §8): one data key per donor,
 * derived from the master key with HKDF and the tenant id as context, so a
 * donor's restricted fields can be destroyed by retiring their key (documented
 * destruction). AES-256-GCM; output = version(1) | iv(12) | tag(16) | ciphertext.
 */
/**
 * A secret from the environment. Outside production a fixed development value keeps local work
 * running; in production a missing secret is a startup failure, never a silent default — a
 * default session secret would let anyone mint a session.
 */
export function secretFromEnv(name: string, devDefault: string): string {
  const v = process.env[name];
  if (v) return v;
  if (process.env.NODE_ENV === "production") throw new Error(`${name} is required in production`);
  return devDefault;
}

function master(): Buffer {
  return Buffer.from(secretFromEnv("DATA_MASTER_KEY", "dev-only-master-key-not-for-production-use"));
}
function tenantKey(tenantId: string): Buffer {
  return Buffer.from(hkdfSync("sha256", master(), Buffer.from(tenantId), Buffer.from("wbl-field-v1"), 32));
}
export function encryptField(tenantId: string, plaintext: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", tenantKey(tenantId), iv);
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return Buffer.concat([Buffer.from([1]), iv, c.getAuthTag(), ct]);
}
export function decryptField(tenantId: string, blob: Buffer): string {
  if (blob[0] !== 1) throw new Error("unknown field-encryption version");
  const d = createDecipheriv("aes-256-gcm", tenantKey(tenantId), blob.subarray(1, 13));
  d.setAuthTag(blob.subarray(13, 29));
  return Buffer.concat([d.update(blob.subarray(29)), d.final()]).toString("utf8");
}
