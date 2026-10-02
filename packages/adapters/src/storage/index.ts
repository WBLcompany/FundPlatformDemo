import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Object storage. Paths always start with the tenant id (kernel.files check constraint). */
export interface ObjectStorage {
  readonly name: string;
  put(key: string, body: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

export class LocalStorage implements ObjectStorage {
  readonly name = "storage-local";
  constructor(private readonly root: string) {}
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error("path escapes storage root");
    return p;
  }
  async put(key: string, body: Uint8Array) {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, body);
  }
  async get(key: string) {
    try { return new Uint8Array(await readFile(this.resolve(key))); } catch { return null; }
  }
}

/** Supabase Storage over HTTP with the caller's JWT (no service key). */
export class SupabaseStorage implements ObjectStorage {
  readonly name = "storage-supabase";
  constructor(private readonly url: string, private readonly bucket: string, private readonly jwt: () => Promise<string>, private readonly anonKey: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async put(key: string, body: Uint8Array, mime: string) {
    const res = await this.fetchImpl(`${this.url}/storage/v1/object/${this.bucket}/${key}`, { method: "POST", body: Buffer.from(body), headers: { authorization: `Bearer ${await this.jwt()}`, apikey: this.anonKey, "content-type": mime, "x-upsert": "false" } });
    if (!res.ok) throw new Error(`storage ${res.status}`);
  }
  async get(key: string) {
    const res = await this.fetchImpl(`${this.url}/storage/v1/object/${this.bucket}/${key}`, { headers: { authorization: `Bearer ${await this.jwt()}`, apikey: this.anonKey } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`storage ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}
