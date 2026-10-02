/**
 * R-009: the national entities registry (NCNP). The fetched record is kept as a
 * snapshot on the association (org.associations.entity_snapshot).
 */
export type EntityRecord = { licenseNo: string; name: string; city: string; officialPhone: string; officialEmail: string; status: "active" | "inactive"; raw: Record<string, unknown> };

export interface EntitiesRegistry {
  readonly name: string;
  lookup(licenseNo: string): Promise<EntityRecord | null>;
}

const FIXTURES: Record<string, Omit<EntityRecord, "raw">> = {
  "1287": { licenseNo: "1287", name: "جمعية البر بالدار البيضاء", city: "الرياض", officialPhone: "+966500000147", officialEmail: "info@albir.example.sa", status: "active" },
  "2210": { licenseNo: "2210", name: "جمعية رعاية الأيتام بالخرج", city: "الخرج", officialPhone: "+966500000222", officialEmail: "info@aytam.example.sa", status: "active" },
  "3345": { licenseNo: "3345", name: "جمعية نماء للتنمية", city: "الدمام", officialPhone: "+966500000345", officialEmail: "info@namaa.example.sa", status: "active" },
  "9001": { licenseNo: "9001", name: "جمعية تجريبية جديدة", city: "جدة", officialPhone: "+966500009001", officialEmail: "info@new.example.sa", status: "active" },
};

export class MockEntitiesRegistry implements EntitiesRegistry {
  readonly name = "entities-mock";
  async lookup(licenseNo: string) {
    const f = FIXTURES[licenseNo];
    return f ? { ...f, raw: { source: "mock", ...f } } : null;
  }
}

export class HttpEntitiesRegistry implements EntitiesRegistry {
  readonly name = "entities-http";
  constructor(private readonly baseUrl: string, private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async lookup(licenseNo: string) {
    const res = await this.fetchImpl(`${this.baseUrl}/entities/${encodeURIComponent(licenseNo)}`, { headers: { authorization: `Bearer ${this.apiKey}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`entities ${res.status}`);
    const j = (await res.json()) as Record<string, unknown>;
    return { licenseNo, name: String(j.name), city: String(j.city ?? ""), officialPhone: String(j.phone ?? ""), officialEmail: String(j.email ?? ""), status: j.active ? "active" : "inactive", raw: j } as EntityRecord;
  }
}
