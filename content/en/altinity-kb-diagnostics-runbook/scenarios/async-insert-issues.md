---
title: "Async insert issues"
linkTitle: "Async insert issues"
weight: 70
description: >
    Diagnosing async insert flush failures, MV-chain timeouts, and stuck
    async insert queues.
keywords:
  - async insert
  - asynchronous_insert_log
  - flusherror
  - MV timeout
  - async_insert_busy_timeout_ms
---

Three failure modes share async-insert symptoms but differ in their cause
and fix. The MV-chain timeout case is the most commonly misdiagnosed — a
flush that looks slow is actually waiting in a queue.

## Async insert flush failures

### Symptoms

- Inserts succeed at the HTTP layer but data is missing or delayed.
- `FlushError` rows in `system.asynchronous_insert_log`.
- Reports of "silent data loss".

### Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q28](/altinity-kb-diagnostics-runbook/query-library/async-inserts/#q28-live-async-insert-health-check-last-5-minutes) | Live snapshot — is it happening right now? |
| 2 | [Q21](/altinity-kb-diagnostics-runbook/query-library/async-inserts/#q21-async-insert-flush-errors) | Recent flush errors with exception text. |
| 3 | [Q22](/altinity-kb-diagnostics-runbook/query-library/async-inserts/#q22-async-insert-impact-aggregation) | Impact aggregation — total rows / bytes affected, time window. |
| 4 | [Q23](/altinity-kb-diagnostics-runbook/query-library/async-inserts/#q23-async-insert-flush-latency-by-tablestatus) | Latency patterns — are flushes timing out? |
| 5 | [Q24](/altinity-kb-diagnostics-runbook/query-library/async-inserts/#q24-slowest-asyncinsertflush-queries) | Slowest flush queries — what's making them slow? |
| 6 | [Q26](/altinity-kb-diagnostics-runbook/query-library/async-inserts/#q26-mv-frequency-in-errors) | Is one specific MV showing up in errors? |
| 7 | [Q25](/altinity-kb-diagnostics-runbook/query-library/async-inserts/#q25-mv-appearances-in-failed-flushes) | Drill into that MV's failure pattern. |
| 8 | [Q27](/altinity-kb-diagnostics-runbook/query-library/async-inserts/#q27-mv-definitions--chain-inspection) | Inspect the MV definition. |

### Common root causes

- MV in the chain hitting a memory limit or a slow JOIN.
- Target table on the MV chain has `TOO_MANY_PARTS`.
- Async insert buffer too large — flush exceeds query memory.
- MV using non-deterministic functions or external dictionaries that are
  slow / failing to refresh.

## MV chain timeout on async inserts

### Symptoms

- `Code: 159. DB::Exception: Wait for async insert timeout (120000 ms) exceeded`.
- `avg_ms` exactly at `async_insert_busy_timeout_ms` (default 120000) —
  the signature of a *wait*, not a *slow work*.
- Specific target tables in the failure list, not all of them.
- Persistent failures, not bursty.

### Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q38](/altinity-kb-diagnostics-runbook/query-library/async-inserts/#q38-async-insert-timeout-failures-by-table) ⭐ | Which tables are timing out. |
| 2 | [Q47](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q47-failed-insert-query-text-inspection) ⭐ | The **actual** physical INSERT target from the query text — not just `tables[]`. |
| 3 | Q39 (`as_select` for MVs writing into those tables) | MV chain depth feeding the failing tables. |
| 4 | [Q42](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q42-partition-count-health) | Are target tables fragmented? |
| 5 | [Q43](/altinity-kb-diagnostics-runbook/query-library/dictionaries-and-kafka/#q43-dictionary-health-check) | Are dictionaries used in MVs healthy? |
| 6 | [Q16](/altinity-kb-diagnostics-runbook/query-library/queries-and-mutations/#q16-query-load-per-host-last-30-minutes) | Other queries running heavily on those tables? |

### Common root causes

1. MV doing batch-ETL work (heavy joins, many `dictGet`, aggregations) at
   insert time.
2. Target table has too many parts — the MV's writes back into it are
   slow.
3. A dictionary used in an MV is slow or stale.
4. MV chain depth too deep (`MV → table → MV → table`).

### Resolution path

1. **Quick relief**: raise `async_insert_busy_timeout_ms` for the
   user/table.
2. **Real fix**: simplify the MV — move heavy work to a scheduled
   Refreshable MV or a batch job.
3. If a dictionary is slow → fix its source or refresh policy.
4. If the target is fragmented → fix the part count first
   ([Too many parts and backpressure](/altinity-kb-diagnostics-runbook/scenarios/too-many-parts-and-backpressure/)).

## Stuck async insert queue (buffers don't drain)

### Symptoms

- `system.metrics.PendingAsyncInsert` very high (hundreds+) on some hosts,
  low on others.
- Failed async inserts piling up.
- `async_insert_threads` already adequately sized.

### Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q47](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q47-failed-insert-query-text-inspection) | Confirm the actual writers. |
| 2 | [Q48](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q48-per-second-activity-from-metric_log) | Active query count per host. |
| 3 | [Q53](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q53-failure-rate-per-host) | Failure rate per host. |
| 4 | [Q52](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q52-routing-settings-inspection) | `async_insert_busy_timeout_ms` and related settings. |
| 5 | Inspect the failing query's `Settings` | Is `wait_for_async_insert=1`? Client is waiting for flush completion. |

### Key signature

`query_duration_ms ≈ async_insert_busy_timeout_ms` with
`UserTimeMicroseconds` in single-digit milliseconds. The insert sat in a
queue for the full timeout, doing no CPU work. See
[Investigation methods → ProfileEvents reveal "waited not worked"](/altinity-kb-diagnostics-runbook/investigation-methods/#profileevents-reveal-waited-not-worked).

### Resolution path

- Raise `async_insert_busy_timeout_ms` (the wait ceiling) — buys time per
  insert, treats the symptom.
- Lower `async_insert_max_data_size` — smaller, more frequent flushes.
- Find and fix the upstream cause of queue concentration —
  [Host-skewed failures](/altinity-kb-diagnostics-runbook/scenarios/host-skewed-failures/)
  is the usual next stop.
