-- The state-machine guard triggers run as the invoker, so the transition tables must be readable.
grant select on project.project_transitions, project.deliverable_transitions, project.amendment_transitions, finance.order_transitions to authenticated;
