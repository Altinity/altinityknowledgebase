---
title: "Replica readonly / high lag"
linkTitle: "Replica readonly"
weight: 40
description: >
    Diagnosing replicas stuck in readonly mode or with growing absolute_delay.
keywords:
  - clickhouse readonly replica
  - absolute_delay
  - clickhouse keeper session
---

## Symptoms

- One or more replicas in readonly mode.
- `absolute_delay` increasing on specific replicas.
- Failover not behaving as expected.

## Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q4](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/#q4-replica-status--lag-and-readonly-per-host) ⭐ | Which replicas are readonly, which tables, lag in seconds. |
| 2 | [Q5](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/#q5-replication-summary-per-host) | Is this isolated or cluster-wide? |
| 3 | [Q29](/altinity-kb-diagnostics-runbook/query-library/keeper-and-coordination/#q29-keeper-connection-status) | Keeper/ZK connection — readonly is often a Keeper-session issue. |
| 4 | [Q30](/altinity-kb-diagnostics-runbook/query-library/keeper-and-coordination/#q30-keeper-errors-last-hour) | Recent Keeper exceptions. |
| 5 | [Q1](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/#q1-replication-queue-overview) | Queue depth on the affected replica — accumulating or stuck? |
| 6 | [Q2](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/#q2-replication-queue--postpone-reasons) | If queue is stuck — `postpone_reason` and `last_exception`. |
| 7 | [Q11](/altinity-kb-diagnostics-runbook/query-library/disk-and-storage/#q11-disk-usage-per-host) | Disk space on affected replica (full disk → readonly). |
| 8 | [Q18](/altinity-kb-diagnostics-runbook/query-library/queries-and-mutations/#q18-recent-oom--exception-queries) | Recent exceptions on that host. |

## Common root causes

- Keeper session lost or Keeper unreachable.
- Disk full.
- Metadata mismatch with Keeper (e.g., after a restore from backup).
- Manual `SYSTEM RESTART REPLICA` needed after a transient Keeper issue.

## Resolution path

- Confirm Keeper connectivity is healthy first (Q29 + Q30); fixing
  Keeper before the replica self-recovers in most cases.
- If disk is full, free space first — the replica may auto-recover.
- If metadata is mismatched, `SYSTEM RESTART REPLICA <db>.<table>`
  reinitialises the replica's view of the ZooKeeper state.
- For persistent failures, see
  [DDLWorker and DDL queue problems](/altinity-kb-setup-and-maintenance/altinity-kb-ddlworker/)
  for related cluster-coordination diagnostics.
