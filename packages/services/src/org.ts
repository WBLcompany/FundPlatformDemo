import { createHash, randomUUID, scryptSync, randomBytes } from "node:crypto";
import { cycle, DomainError, finance, org } from "@wbl/domain";
import { generateCode, hashCode } from "@wbl/adapters";
import { encryptField, type Database } from "@wbl/kernel";
import { authorize, currentVersion, riyadhToday, type Ctx } from "./context";
import { runSyncTask } from "./ai";

/* ── Registration (R-009, R-010, R-011, R-014) — runs as anon with the tenant from the host ── */

export async function lookupLicense(ctx: Ctx, rawLicense: string) {
  const license = org.normalizeLicense(rawLicense);
  if (!license) return null;
  const rec = await ctx.adapters.entities.lookup(license);
  if (!rec || rec.status !== "active") return null;
  return { license, name: rec.name, city: rec.city, maskedPhone: org.maskPhone(rec.officialPhone), maskedEmail: org.maskEmail(rec.officialEmail) };
}

/** Sends a code to the OFFICIAL phone from the registry (never one the user typed). */
export async function startRegistrationOtp(ctx: Ctx, license: string): Promise<{ otpId: string; maskedPhone: string }> {
  const rec = await ctx.adapters.entities.lookup(license);
  if (!rec) throw new DomainError("unknown_license", "لم نجد جمعية بهذا الرقم");
  const code = generateCode();
  const masked = org.maskPhone(rec.officialPhone);
  const row = await ctx.tx.one<{ otp_issue: string }>("select iam.otp_issue('registration', $1, $2, $3)", [license, masked, hashCode(code, ctx.env.otpSalt)]);
  await ctx.adapters.otp.send(rec.officialPhone, code, "registration");
  return { otpId: row.otp_issue, maskedPhone: masked };
}

export async function verifyOtp(ctx: Ctx, otpId: string, purpose: string, code: string) {
  const r = await ctx.tx.one<{ otp_verify: string }>("select iam.otp_verify($1, $2, $3)", [otpId, purpose, hashCode(code, ctx.env.otpSalt)]);
  const v = r.otp_verify;
  if (v === "ok") return { ok: true as const };
  return { ok: false as const, reason: v.startsWith("wrong") ? "wrong" : v, attemptsLeft: v.startsWith("wrong:") ? Number(v.split(":")[1]) : 0 };
}

export function hashPassword(pw: string): string {
  if (pw.length < 10) throw new DomainError("weak_password", "كلمة المرور عشرة أحرف على الأقل");
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${Buffer.from(salt).toString("base64")}$${key.toString("base64")}`;
}

export async function completeRegistration(ctx: Ctx, input: { license: string; otpId: string | null; via: "otp" | "letter"; letterFileId?: string | null; fullName: string; email: string; phone: string; password: string }) {
  const rec = await ctx.adapters.entities.lookup(input.license);
  if (!rec) throw new DomainError("unknown_license", "لم نجد جمعية بهذا الرقم");
  const personId = randomUUID();
  const a = await ctx.tx.one<{ register_association: string }>(
    "select org.register_association($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
    [rec.licenseNo, rec.name, rec.city, rec.officialPhone, rec.officialEmail, JSON.stringify(rec.raw), input.via, input.otpId, input.letterFileId ?? null,
      personId, input.fullName, input.email.toLowerCase(), input.phone, hashPassword(input.password)]);
  return { associationId: a.register_association, personId };
}

/** R-011: staff approve a letter registration; the owner's membership activates. */
export async function reviewLetter(ctx: Ctx, associationId: string, approve: boolean) {
  authorize(ctx, "association.approve_letter", {});
  const a = await ctx.tx.one<{ status: string }>("select status from org.associations where id = $1", [associationId]);
  if (a.status !== "pending_review") throw new DomainError("not_pending");
  await ctx.tx.query("update org.associations set status = $2, approved_by = auth.uid() where id = $1", [associationId, approve ? "active" : "rejected"]);
  if (approve) await ctx.tx.query("update iam.memberships set active = true where org_id = $1 and role = 'assoc_owner'", [associationId]);
  await ctx.tx.emit({ type: "association.letter_reviewed", entityKind: "association", entityId: associationId, payload: { approved: approve, org_id: associationId } });
}

/* ── Documents (R-013, N-01, R-017) ── */

export async function storeFile(ctx: Ctx, input: { name: string; mime: string; body: Uint8Array; ownerOrgId: string | null; text?: string | null }): Promise<string> {
  const sha = createHash("sha256").update(input.body).digest("hex");
  const id = randomUUID();
  const safe = input.name.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 80);
  const key = `${ctx.actor.tenantId}/quarantine/${id}-${safe}`;
  await ctx.adapters.storage.put(key, input.body, input.mime);
  await ctx.tx.query(
    "insert into kernel.files (tenant_id, id, storage_path, name, mime, size_bytes, sha256, owner_org_id, uploaded_by, text_content) values (app.tenant(), $1, $2, $3, $4, $5, $6, $7, auth.uid(), $8)",
    [id, key, input.name, input.mime, input.body.length, sha, input.ownerOrgId, input.text ?? null]);
  // Scanning happens out of band in the worker (quarantine → clean); dev scanner is synchronous and cheap.
  return id;
}

export async function uploadDocument(ctx: Ctx, input: { associationId: string; file: { name: string; mime: string; body: Uint8Array; text?: string | null } }) {
  if (!ctx.actor.grants.some((g) => g.orgId === input.associationId)) throw new DomainError("forbidden");
  const fileId = await storeFile(ctx, { ...input.file, ownerOrgId: input.associationId });
  const doc = await ctx.tx.one<{ id: string }>(
    "insert into org.documents (tenant_id, association_id, doc_type, file_id, status) values (app.tenant(), $1, 'unknown', $2, 'pending') returning id",
    [input.associationId, fileId]);
  // N-01: the AI proposes type, number and dates; a person confirms. Fails quietly to the manual form.
  const ai = await runSyncTask(ctx, { task: "document.extract", subjectKind: "document", subjectId: doc.id, inputs: { file_name: input.file.name, attachments: [{ id: fileId, text: input.file.text ?? null }] } });
  if (ai.id) await ctx.tx.query("update org.documents set ai_output_id = $2 where id = $1", [doc.id, ai.id]);
  await ctx.tx.emit({ type: "org_document.uploaded", entityKind: "association", entityId: input.associationId, payload: { document_id: doc.id, org_id: input.associationId } });
  return { documentId: doc.id, extraction: ai };
}

export async function confirmDocument(ctx: Ctx, input: { documentId: string; type: string; number: string | null; issueDate: string | null; expiryDate: string | null }) {
  const cur = await currentVersion(ctx.tx);
  const dt = cur.config.documentTypes.find((d) => d.key === input.type);
  if (!dt) throw new DomainError("unknown_type", "نوع الوثيقة غير معروف");
  if (dt.expires && !input.expiryDate) throw new DomainError("expiry_required", "تاريخ الانتهاء مطلوب لهذا النوع");
  const doc = await ctx.tx.one<{ association_id: string }>("select association_id from org.documents where id = $1", [input.documentId]);
  // A newer confirmed document of the same type supersedes the old one.
  await ctx.tx.query("update org.documents set status = 'superseded' where association_id = $1 and doc_type = $2 and status = 'confirmed' and id <> $3", [doc.association_id, input.type, input.documentId]);
  await ctx.tx.query(
    "update org.documents set doc_type = $2, number = $3, issue_date = $4, expiry_date = $5, status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(), reminder_sent_at = null where id = $1",
    [input.documentId, input.type, input.number, input.issueDate, input.expiryDate]);
  await ctx.tx.emit({ type: "org_document.confirmed", entityKind: "association", entityId: doc.association_id, payload: { document_id: input.documentId, type: input.type, org_id: doc.association_id } });
}

export async function associationDocuments(ctx: Ctx, associationId: string) {
  const today = riyadhToday(ctx.now);
  const rows = await ctx.tx.query<{ id: string; doc_type: string; number: string | null; expiry_date: string | null; status: string; file_name: string | null }>(
    `select d.id, d.doc_type, d.number, to_char(d.expiry_date, 'YYYY-MM-DD') as expiry_date, d.status, f.name as file_name
       from org.documents d left join kernel.files f on f.tenant_id = d.tenant_id and f.id = d.file_id
      where d.association_id = $1 and d.status in ('confirmed','pending') order by d.created_at desc`, [associationId]);
  return rows.map((r) => ({ ...r, state: r.status === "pending" ? "pending" as const : cycle.documentState(r.expiry_date, today) }));
}

/* ── Readiness (R-015, R-016) ── */

export async function readiness(ctx: Ctx, associationId: string, programId?: string) {
  const cur = await currentVersion(ctx.tx);
  const a = await ctx.tx.one<{ status: "pending_review" | "active" | "suspended" | "rejected"; suspended_reason: string | null }>("select status, suspended_reason from org.associations where id = $1", [associationId]);
  const docs = await ctx.tx.query<{ doc_type: string; expiry_date: string | null; status: string }>(
    "select doc_type, to_char(expiry_date, 'YYYY-MM-DD') as expiry_date, status from org.documents where association_id = $1 and status = 'confirmed'", [associationId]);
  const overdue = await ctx.tx.one<{ n: number }>(
    "select count(*)::int as n from finance.disbursement_orders where association_id = $1 and status = 'executed' and receipt_received_at is null and receipt_due_at < now()", [associationId]);
  const program = programId ? cur.config.programs.find((p) => p.id === programId) : undefined;
  const labels = Object.fromEntries(cur.config.documentTypes.map((d) => [d.key, d.label]));
  return cycle.checkReadiness({
    accountActive: true, associationStatus: a.status, suspendedReason: a.suspended_reason,
    documents: docs.map((d) => ({ type: d.doc_type, expiryDate: d.expiry_date, confirmed: true })),
    requiredDocuments: cur.config.settings.readiness.requiredDocuments, documentLabels: labels,
    overdueObligations: overdue.n, noOverdueObligations: cur.config.settings.readiness.noOverdueObligations,
    programOpen: program ? cycle.programIsOpen(program, ctx.now) : true, today: riyadhToday(ctx.now),
  });
}

/* ── Association users and sensitive changes (R-012, R-092, R-070) ── */

export async function startStepUp(ctx: Ctx, purpose: "delegation" | "bank_account" | "official_contact" | "signatory", associationId: string) {
  const a = await ctx.tx.one<{ official_phone: string }>("select official_phone from org.associations where id = $1", [associationId]);
  const code = generateCode();
  const row = await ctx.tx.one<{ otp_issue: string }>("select iam.otp_issue($1, $2, $3, $4)", [purpose, associationId, org.maskPhone(a.official_phone), hashCode(code, ctx.env.otpSalt)]);
  await ctx.adapters.otp.send(a.official_phone, code, purpose);
  return { otpId: row.otp_issue, maskedPhone: org.maskPhone(a.official_phone) };
}

/** R-012 + R-092: the owner adds a user with a role, after a code sent to the official number. */
export async function addAssociationUser(ctx: Ctx, input: { associationId: string; otpId: string; fullName: string; email: string; phone: string; role: "assoc_applicant" | "assoc_coordinator"; password: string; db?: Database }) {
  authorize(ctx, "association.manage_users", { orgId: input.associationId, targetPersonId: null });
  const ok = await ctx.tx.one<{ otp_consumed: boolean }>("select iam.otp_consumed($1, 'delegation', $2)", [input.otpId, input.associationId]);
  if (!ok.otp_consumed) throw new DomainError("otp_required", "أدخل رمز التحقق المرسل إلى الرقم الرسمي");
  const personId = randomUUID();
  await ctx.tx.query("select iam.add_org_user($1, $2, $3, $4, $5, $6, $7)", [personId, input.fullName, input.email.toLowerCase(), input.phone, hashPassword(input.password), input.role, input.associationId]);
  await ctx.tx.emit({ type: "membership.changed", entityKind: "association", entityId: input.associationId, payload: { person_id: personId, role: input.role, org_id: input.associationId } });
  return { personId };
}

/** R-070: a new bank account needs a step-up code, notifies, and is unusable until finance acknowledges it. */
export async function requestBankChange(ctx: Ctx, input: { associationId: string; otpId: string; bankName: string; iban: string }) {
  authorize(ctx, "bank.request_change", { orgId: input.associationId });
  const iban = input.iban.replace(/\s+/g, "").toUpperCase();
  if (!finance.validSaudiIban(iban)) throw new DomainError("bad_iban", "رقم الآيبان غير صحيح");
  const ok = await ctx.tx.one<{ otp_consumed: boolean }>("select iam.otp_consumed($1, 'bank_account', $2)", [input.otpId, input.associationId]);
  if (!ok.otp_consumed) throw new DomainError("otp_required", "أدخل رمز التحقق");
  const change = await ctx.tx.one<{ id: string }>(
    "insert into iam.sensitive_changes (tenant_id, kind, org_id, payload, otp_id, requested_by) values (app.tenant(), 'bank_account', $1, $2, $3, auth.uid()) returning id",
    [input.associationId, JSON.stringify({ bank: input.bankName, last4: iban.slice(-4) }), input.otpId]);
  const acct = await ctx.tx.one<{ id: string }>(
    "insert into finance.bank_accounts (tenant_id, association_id, bank_name, iban_enc, iban_last4, status, change_id) values (app.tenant(), $1, $2, $3, $4, 'pending', $5) returning id",
    [input.associationId, input.bankName, encryptField(ctx.actor.tenantId, iban), iban.slice(-4), change.id]);
  await ctx.tx.emit({ type: "bank_account.change_requested", entityKind: "association", entityId: input.associationId, payload: { last4: iban.slice(-4), org_id: input.associationId, account_id: acct.id } });
  return { accountId: acct.id };
}

export async function acknowledgeBank(ctx: Ctx, accountId: string) {
  const a = await ctx.tx.one<{ association_id: string; change_id: string | null; status: string; iban_last4: string }>("select association_id, change_id, status, iban_last4 from finance.bank_accounts where id = $1", [accountId]);
  const requestedBy = a.change_id ? (await ctx.tx.maybe<{ requested_by: string }>("select requested_by from iam.sensitive_changes where id = $1", [a.change_id]))?.requested_by ?? null : null;
  authorize(ctx, "bank.acknowledge", { requestedBy });
  if (a.status !== "pending") throw new DomainError("not_pending");
  await ctx.tx.query("update finance.bank_accounts set status = 'replaced' where association_id = $1 and status = 'acknowledged'", [a.association_id]);
  await ctx.tx.query("update finance.bank_accounts set status = 'acknowledged', acknowledged_by = auth.uid(), acknowledged_at = now() where id = $1", [accountId]);
  if (a.change_id) await ctx.tx.query("update iam.sensitive_changes set status = 'applied', reviewed_by = auth.uid(), reviewed_at = now() where id = $1", [a.change_id]);
  await ctx.tx.emit({ type: "bank_account.acknowledged", entityKind: "association", entityId: a.association_id, payload: { last4: a.iban_last4, org_id: a.association_id } });
}
