/**
 * Arabic normalisation for search (D-10). Mirrors app.normalize_ar() in
 * supabase/migrations/…_search_reporting.sql — the test asserts both agree.
 */
const DIACRITICS = /[ً-ٰٟـ]/g;
const MAP: Record<string, string> = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي" };

export function normalizeArabic(s: string): string {
  return s
    .replace(DIACRITICS, "")
    .replace(/[أإآٱىةؤئ]/g, (c) => MAP[c]!)
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .toLowerCase();
}

/** Builds the ILIKE pattern used against kernel.search_index.norm (trigram-indexed). */
export function searchPattern(q: string): string | null {
  const n = normalizeArabic(q).trim().replace(/[%_\\]/g, (c) => `\\${c}`);
  return n.length >= 2 ? `%${n}%` : null;
}
