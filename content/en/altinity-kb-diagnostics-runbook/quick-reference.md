---
title: "Quick reference: symptom to query"
linkTitle: "Quick reference"
weight: 10
description: >
    One-page lookup: pick a symptom, jump to the query that diagnoses it.
keywords:
  - clickhouse triage
  - clickhouse diagnostics
  - postpone_reason
  - replication queue
  - async insert
---

When you have a specific symptom, run the indicated query first. When you
don't know what's wrong, run **Q5 → Q11 → Q15 → Q17** in that order — it
gives you 80% of the cluster's state in about ten seconds.

All query IDs (`Q1`, `Q2`, …) link into the
[query library](/altinity-kb-diagnostics-runbook/query-library/).

## Symptom → first query

| Symptom | Run first | Section |
|---|---|---|
| Queue not draining | Q2 — postpone reasons | [Replication and queue](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/) |
| Background pool pinned, no progress | Q31 — active fetches | [Replication and queue](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/) |
| Async insert timeout | Q38 — failure tables | [Async inserts](/altinity-kb-diagnostics-runbook/query-library/async-inserts/) |
| Kafka consumer kicks (`max.poll.interval.ms`) | Q44 — consumers vs pool | [Dictionaries and Kafka](/altinity-kb-diagnostics-runbook/query-library/dictionaries-and-kafka/) |
| Memory low | Q15 then Q8 — merges holding RAM | [Pools and resources](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/) |
| OOM / `MEMORY_LIMIT_EXCEEDED` | Q15 + Q17 + Q18 | [Pools and resources](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/), [Queries and mutations](/altinity-kb-diagnostics-runbook/query-library/queries-and-mutations/) |
| Disk full / `NOT_ENOUGH_SPACE` | Q11 | [Disk and storage](/altinity-kb-diagnostics-runbook/query-library/disk-and-storage/) |
| Mutations stuck | Q19 | [Queries and mutations](/altinity-kb-diagnostics-runbook/query-library/queries-and-mutations/) |
| Replica readonly | Q4 + Q29 | [Replication and queue](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/), [Keeper and coordination](/altinity-kb-diagnostics-runbook/query-library/keeper-and-coordination/) |
| Slow queries | Q17 + Q16 | [Queries and mutations](/altinity-kb-diagnostics-runbook/query-library/queries-and-mutations/) |
| Insert backpressure ("delayed by X ms") | Q7 — parts per partition | [Parts and merges](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/) |
| Failures concentrated on a subset of hosts | Q46 + Q53 + Q48 | [Insert load and host skew](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/) |
| Don't know what's wrong | Q5 → Q11 → Q15 → Q17 | mixed |

## Common `postpone_reason` patterns

From `system.replication_queue.postpone_reason` (Q2). The text is what to
match on:

| Pattern in `postpone_reason` | What it means |
|---|---|
| `N fetches already executing, max N` | Fetch pool pinned. Check Q31 for actual transfers — if `replicated_fetches` is near-empty while the pool counter is at the limit, the symptom is Keeper saturation, not pool exhaustion. |
| `source parts size … greater than current maximum` | Fetch waiting on a merge to produce a smaller source part. Look at Q8 for the upstream merge. |
| `covering parts list` | Merge is waiting on child fetches to land. |
| `another log entry for same part is being processed` | Normal serialisation. Only a problem if persistent (the same entry stuck for tens of minutes). |
| Anything mentioning `timeout`, `S3`, or `network` | Infrastructure-layer issue — investigate the storage/network path, not ClickHouse internals. |

## "Trust but verify" — pitfalls that hide root causes

- **Empty `system.replicated_fetches` despite a high
  `BackgroundFetchesPoolTask` counter** means tasks are stuck claiming slots
  but not transferring. The pool isn't the bottleneck — Keeper or another
  coordinator usually is.
- **`query_log.tables` is an array** that includes every table touched —
  inserts, MV dependencies, and read-side joins. Use `arrayJoin(tables)` for
  per-table grouping, never `tables[1]` as "the writer". The actual physical
  INSERT target is in the query text. Always inspect the query text before
  blaming a specific table.
- **`system.query_log` has no `database` or `table` column** — they live in
  `databases[]` and `tables[]`.
- **`part_log` is the source of truth for "is this table being written to?"**
  It covers both direct inserts and MV writes, while `query_log` only sees
  the originating query.
- **`avg_ms ≈ async_insert_busy_timeout_ms`** is the signature of an MV-chain
  timeout (the insert is *waiting*, not *working*). A genuinely slow insert
  has a distribution; a queue timeout is a hard ceiling.
- **`system.metric_log` stores metrics as columns, not rows**
  (`CurrentMetric_*`, `ProfileEvent_*`). You cannot filter with
  `WHERE metric IN (…)` — `SELECT` the specific columns.
- **`system.events` uses an `event` column, not a `metric` column.** Easy
  thinko when you switch between `metric_log`/`metrics` and `events`.
- **`system.zookeeper_log` does not exist on every version.** Run
  `EXISTS TABLE system.zookeeper_log` before assuming it's available.
- **`EXPLAIN PIPELINE graph=1`** uses lowercase `graph=1`. Older syntax
  (`GRAPH = 1`) does not parse.
- **The `views`/`view_durations` columns on `query_log` vary by version.**
  When in doubt:
  `SELECT name FROM system.columns WHERE database='system' AND table='query_log' AND name ILIKE '%view%'`.
- **Cumulative `system.events` totals integrate since process start.** Ratios
  computed from them can reflect a peak-load period from days ago. Use
  `system.metric_log` over a recent window when comparing live host
  behaviour. See
  [Investigation methods → cumulative metrics hide current state](/altinity-kb-diagnostics-runbook/investigation-methods/#cumulative-metrics-hide-current-state).

## Priority heatmap

If you can only run one query for a given scenario, the scenario page marks
it with **⭐**. For broad triage where you don't know the scenario yet:
`Q5 → Q11 → Q15 → Q17` covers replication, disk, memory, and active queries
in four queries.
