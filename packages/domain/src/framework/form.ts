import type { FormSchema } from "./schema";

export type FormErrors = Record<string, string>;

/** Validates form data against the JSON Schema subset. Errors are Arabic, per field. */
export function validateForm(schema: FormSchema, data: Record<string, unknown>, { partial = false } = {}): FormErrors {
  const errors: FormErrors = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    const raw = data[key];
    const empty = raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
    if (empty) {
      if (!partial && schema.required.includes(key)) errors[key] = "هذا الحقل مطلوب";
      continue;
    }
    if (prop.type === "string") {
      if (typeof raw !== "string") { errors[key] = "قيمة غير صالحة"; continue; }
      if (prop.maxLength && raw.length > prop.maxLength) errors[key] = `الحد الأقصى ${prop.maxLength} حرفاً`;
    } else {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) { errors[key] = "أدخل رقماً"; continue; }
      if (prop.type === "integer" && !Number.isInteger(n)) { errors[key] = "أدخل عدداً صحيحاً"; continue; }
      if (prop.minimum !== undefined && n < prop.minimum) errors[key] = `الحد الأدنى ${prop.minimum}`;
      if (prop.maximum !== undefined && n > prop.maximum) errors[key] = `الحد الأقصى ${prop.maximum}`;
    }
  }
  return errors;
}

export function completeness(schema: FormSchema, data: Record<string, unknown>): { done: number; total: number; missing: string[] } {
  const missing = schema.required.filter((k) => {
    const v = data[k];
    return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
  });
  return { done: schema.required.length - missing.length, total: schema.required.length, missing };
}

/** Reads the mapped values (title, requested amount in halalas, beneficiaries) out of form data. */
export function mappedValues(schema: FormSchema, data: Record<string, unknown>) {
  const out: { title?: string; requestedHalalas?: number; beneficiaries?: number } = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    const v = data[key];
    if (v === undefined || v === null || v === "") continue;
    if (prop["x-maps-to"] === "title") out.title = String(v);
    if (prop["x-maps-to"] === "requested_amount") { const n = Number(v); if (Number.isFinite(n)) out.requestedHalalas = Math.round(n * 100); }
    if (prop["x-maps-to"] === "beneficiaries") { const n = Number(v); if (Number.isFinite(n)) out.beneficiaries = n; }
  }
  return out;
}
