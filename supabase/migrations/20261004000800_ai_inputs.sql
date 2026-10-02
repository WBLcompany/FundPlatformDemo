-- T-30 · the redacted inputs a task was sent with, and the reverse map that
-- stays in the platform (R-112). Readable by the worker only.
alter table cycle.ai_outputs add column inputs_redacted jsonb;
alter table cycle.ai_outputs add column redaction_map jsonb;
revoke select on cycle.ai_outputs from authenticated;
grant select (tenant_id, id, task, schema_version, subject_kind, subject_id, status, idempotency_key, manih_task_id, framework_version_id,
  input_hash, model, package_version, output, evidence, error, cost_usd, latency_ms, attempts, requested_by, created_at, settled_at) on cycle.ai_outputs to authenticated;

-- The worker reads the full row (inputs + map) through this definer function, scoped to its tenant.
create or replace function cycle.ai_task_payload(p_id uuid) returns table (inputs jsonb, redaction_map jsonb)
language sql stable security definer set search_path = '' as $$
  select o.inputs_redacted, o.redaction_map from cycle.ai_outputs o where o.tenant_id = app.tenant() and o.id = p_id and app.is_system()
$$;
grant execute on function cycle.ai_task_payload(uuid) to authenticated;
