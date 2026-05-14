---
title: "ClickHouse® Cluster Diagnostics Runbook"
linkTitle: "Diagnostics Runbook"
weight: 110
description: >
    A query library and scenario-based diagnostic flows for triaging
    ClickHouse® clusters during incidents.
keywords:
  - clickhouse diagnostics
  - clickhouse troubleshooting
  - clickhouse runbook
  - replication queue
  - async inserts
  - keeper
  - host skew
---

A reference for diagnosing problems on a running ClickHouse® cluster: a
catalogue of cluster-wide queries you can run, organised by subsystem, plus
scenario playbooks that walk you from a symptom to the queries that resolve
it.

The intended reader is an on-call or support engineer who has cluster-wide
read access and needs to identify *which subsystem* is misbehaving as quickly
as possible.

## How this runbook is organised

| Section | What's in it |
|---|---|
| [Quick reference](/altinity-kb-diagnostics-runbook/quick-reference/) | One-page symptom → query map and the gotchas every diagnosis depends on. **Start here.** |
| [Investigation methods](/altinity-kb-diagnostics-runbook/investigation-methods/) | Process reminders — how to avoid common misdiagnoses. |
| [Query library](/altinity-kb-diagnostics-runbook/query-library/) | 54 cluster-wide queries grouped by subsystem (replication, parts, async inserts, Keeper, etc.). Reference material. |
| [Scenarios](/altinity-kb-diagnostics-runbook/scenarios/) | Step-by-step diagnostic flows for specific failure modes. |

## How the queries are written

Every query in the library fans out across the cluster using
`clusterAllReplicas('{cluster}', system.<table>)`. Replace these placeholders
before running:

- `{cluster}` — your cluster name (the value used in `remote_servers` /
  `system.clusters.cluster`).
- `{database}`, `{table}`, `{mv_name}`, `{target_table_pattern}` — appear in
  queries that drill into a specific object.

Most queries include `hostName() AS host` as the first column so you can see
per-replica behaviour at a glance. Replication and metric tables vary slightly
across ClickHouse versions — when in doubt, inspect the columns first with
`SELECT name FROM system.columns WHERE database='system' AND table='<name>'`.

## Patterns that recur

These are the misreads that account for a large share of wrong diagnoses.
Read them once before drilling into a specific scenario.

1. **Host-skewed failures with a balanced workload.** Settings identical,
   workload balanced, but failure rates differ wildly across replicas. The
   cause is usually entry-point routing (HAProxy / ingress) directing most
   traffic to a subset of hosts — not a ClickHouse misconfiguration. See
   [scenarios → host-skewed failures](/altinity-kb-diagnostics-runbook/scenarios/host-skewed-failures/).

2. **`tables[]` in `query_log` is not the writer.** Failed inserts list many
   tables. The actual physical writer is in the INSERT query text — not the
   first element of `tables[]`, which also includes the MV dependency chain.
   See the [insert load and host skew queries](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/) and
   [scenarios → async insert issues](/altinity-kb-diagnostics-runbook/scenarios/async-insert-issues/).

3. **Cumulative vs current state.** `system.events` totals since process
   start; ratios computed from those totals can show stale peak-load skew
   that no longer exists. Always cross-check with `system.metric_log` over a
   recent window before concluding "host X is slow".

4. **ProfileEvents reveal "waited not worked".** A failed insert with
   `RealTimeMicroseconds ≈ timeout` and `UserTimeMicroseconds < 10ms` means
   the query never executed. The bottleneck is a lock or queue, not work.
   Look upstream for what is blocking.

5. **Same settings + different behaviour ⇒ upstream cause.** When
   `system.settings` is identical across hosts and behaviour is still
   skewed, the cause is outside ClickHouse: entry-point routing, pod
   resource contention, or leader-coordination concentration. Stop looking
   inside ClickHouse.

## Where to start

- "Customer says something is wrong, I don't know what" → run
  [Scenario 10: General triage](/altinity-kb-diagnostics-runbook/scenarios/general-triage/).
- "I have a specific symptom" → open the
  [quick reference](/altinity-kb-diagnostics-runbook/quick-reference/).
- "I need a specific query" → browse the
  [query library](/altinity-kb-diagnostics-runbook/query-library/) by subsystem.

## Related KB pages

- [Who ate my memory?](/altinity-kb-setup-and-maintenance/altinity-kb-who-ate-my-memory/) — focused memory diagnostics.
- [Who ate my CPU?](/altinity-kb-setup-and-maintenance/who-ate-my-cpu/) — focused CPU diagnostics.
- [DDLWorker and DDL queue problems](/altinity-kb-setup-and-maintenance/altinity-kb-ddlworker/) — `ON CLUSTER` task troubleshooting.
- [System tables eat my disk](/altinity-kb-setup-and-maintenance/altinity-kb-system-tables-eat-my-disk/) — when `*_log` tables grow too large.
