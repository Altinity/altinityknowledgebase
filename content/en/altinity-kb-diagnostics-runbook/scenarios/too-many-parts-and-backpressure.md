---
title: "Too many parts and backpressure"
linkTitle: "Too many parts and backpressure"
weight: 30
description: >
    Diagnosing `TOO_MANY_PARTS` (code 252), insert delays, and the
    sustained insert pressure that causes cascading issues.
keywords:
  - TOO_MANY_PARTS
  - parts_to_delay_insert
  - parts_to_throw_insert
  - clickhouse backpressure
---

Three related failure modes appear here: hard `TOO_MANY_PARTS` rejections,
soft "Delaying inserts by N ms" warnings, and the sustained high insert
rate that causes multiple symptoms at once.

## TOO_MANY_PARTS / part explosion

### Symptoms

- Inserts failing with code 252 (`TOO_MANY_PARTS`).
- Or inserts delayed with "Delaying inserts by N ms" warnings in the log.
- Parts count per partition exceeds ~300.

### Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q6](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q6-parts-health-per-host) | Tables with highest active part count — single offender or cluster-wide? |
| 2 | [Q7](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q7-parts-count-per-partition) ⭐ | Parts per partition — `parts_to_delay_insert` is **per partition**, not per table. |
| 3 | [Q9](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q9-part-creation-vs-merge-rate-last-30-minutes) | New parts vs merged parts in the last 30 minutes — is merge throughput below insert rate? |
| 4 | [Q8](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q8-active-merges) | Are merges actually running, or queued and idle? |
| 5 | [Q13](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q13-pool-saturation-metrics) | Merge pool saturated? |
| 6 | [Q10](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q10-merge-settings-check) | Confirm `parts_to_delay_insert` / `parts_to_throw_insert` thresholds. |
| 7 | [Q22](/altinity-kb-diagnostics-runbook/query-library/async-inserts/#q22-async-insert-impact-aggregation), [Q23](/altinity-kb-diagnostics-runbook/query-library/async-inserts/#q23-async-insert-flush-latency-by-tablestatus) | If async inserts are in use — are flushes producing many small parts? |

### Common root causes

- Insert batch size too small (sync inserts without client-side batching —
  one part per insert).
- Async inserts not enabled, or buffer thresholds too small.
- Partitioning too granular (e.g., per-hour partitioning on a dataset that
  could be per-day).
- Merge pool too small for the insert rate.
- Excessive `Nullable` columns slowing merges.

## Insert backpressure ("delayed inserts")

### Symptoms

- Inserts not failing, just very slow.
- Server logs show "Delaying inserts by N ms".

### Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q7](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q7-parts-count-per-partition) ⭐ | Partition with > `parts_to_delay_insert` (default 150) parts. |
| 2 | [Q10](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q10-merge-settings-check) | Confirm threshold values. |
| 3 | [Q8](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q8-active-merges) | Are merges keeping up? |
| 4 | [Q9](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q9-part-creation-vs-merge-rate-last-30-minutes) | New-parts vs merged-parts ratio. |
| 5 | [Q13](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q13-pool-saturation-metrics) | Merge pool capacity. |

## Sustained high insert rate causing cascading issues

### Symptoms

- Multiple symptoms at once: timeouts, Kafka kicks, part growth.
- "The same issues come back after fixing X."
- No single clear root cause.

### Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q37](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q37-insert-rate-per-minute-spike-detection) | Insert rate per minute — sustained or spike? |
| 2 | [Q36](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q36-insert-volume-by-target-table-last-24-hours) | Insert volume by target table — biggest contributors. |
| 3 | [Q35](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q35-insert-volume-by-user-last-24-hours) | Insert volume by user — which clients. |
| 4 | [Q38](/altinity-kb-diagnostics-runbook/query-library/async-inserts/#q38-async-insert-timeout-failures-by-table) | Currently failing tables. |
| 5 | [Q42](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q42-partition-count-health) | Part fragmentation per table. |
| 6 | Q39 (in MV chain — see `system.tables`) | MV chains on the failing tables. |

### How to read the result

- **Few inserts/minute with huge row counts** → bulk loads; MV chain
  bottleneck is the likely cause.
- **Many inserts/minute with small row counts** → batch size problem;
  fix at the producer or via async insert configuration.
- **Spike pattern** → identify the specific user or process responsible.
- **Flat pattern** → baseline load multiplied by a config issue.
