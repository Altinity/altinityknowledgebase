---
title: "Merge–fetch and pool issues"
linkTitle: "Merge–fetch and pool issues"
weight: 20
description: >
    Diagnosing replication queues that stop draining, including merge–fetch
    cycles and fetch-pool deadlocks where slots are claimed but no transfers
    happen.
keywords:
  - replication queue
  - postpone_reason
  - replicated_fetches
  - background_fetches_pool_size
---

Two distinct failure modes share these symptoms but need different fixes.
The first is a merge↔fetch cycle (work blocked behind itself). The second
is a fetch-pool deadlock where the pool counter is pinned but
`replicated_fetches` is near-empty — typically a Keeper saturation under a
fragmentation-driven coordination load.

## Merge↔fetch cycle / merge stall

### Symptoms

- Replication queue not draining even with ingestion stopped.
- `merges_in_queue` high, but few active merges.
- Reports of "merges waiting for fetches, fetches waiting for merges".
- Parts count climbing despite no or low writes.

### Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q5](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/#q5-replication-summary-per-host) | Which hosts have readonly tables, max lag, largest queues. |
| 2 | [Q4](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/#q4-replica-status--lag-and-readonly-per-host) | Specific tables — is one replica lagging while others are fine? |
| 3 | [Q2](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/#q2-replication-queue--postpone-reasons) ⭐ | `postpone_reason` text — look for "source parts size … greater than current maximum", "another log entry for same part is being processed", "covering parts list". |
| 4 | [Q3](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/#q3-queue-entry-type-breakdown) | Entry type breakdown — `GET_PART` (fetches) vs `MERGE_PARTS` ratio. |
| 5 | [Q13](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q13-pool-saturation-metrics) | Are `BackgroundFetchesPoolTask` and `BackgroundMergesAndMutationsPoolTask` pinned at their pool size? |
| 6 | [Q14](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q14-pool-sizes-server-settings) | Confirm configured pool sizes — has the cluster been pre-tuned? |
| 7 | [Q8](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q8-active-merges) | Are merges making progress, or stuck for hours on huge parts? |
| 8 | [Q11](/altinity-kb-diagnostics-runbook/query-library/disk-and-storage/#q11-disk-usage-per-host) | Disk full ruled out? `NOT_ENOUGH_SPACE` looks like a merge stall but is separate. |

### Common root causes

- Pool sizes too small for the workload (especially
  `background_fetches_pool_size`).
- Wide imbalance — one replica not serving fetches (S3, network, or
  credentials) so peers cannot pull.
- Disk full on one node blocks merges, cascading into a fetch backlog on
  peers.
- Merge throughput collapsed because of 100+ GiB merges on slow storage.

## Distributed fetch deadlock (pool pinned, no transfers)

### Symptoms

- `BackgroundFetchesPoolTask` at pool size on all hosts.
- Replication queue is 99%+ `GET_PART` (not `MERGE_PARTS`).
- Queue does not drain even with ingestion stopped.
- [Q31](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/#q31-replicated-fetches-in-flight)
  returns very few rows compared to the claimed pool slots.
- `postpone_reason` mentions *"Not executing fetch of part X because N
  fetches already executing, max N"*.

This is **not** a merge↔fetch cycle. Pool slots are claimed but transfers
aren't happening.

### Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q5](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/#q5-replication-summary-per-host) | Queue depth per host — usually concentrated on a subset. |
| 2 | [Q2](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/#q2-replication-queue--postpone-reasons) | `postpone_reason` mentioning "fetches already executing, max". |
| 3 | [Q13](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q13-pool-saturation-metrics) | `BackgroundFetchesPoolTask = pool_size` on all hosts but `ReplicatedFetch` near zero. |
| 4 | [Q31](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/#q31-replicated-fetches-in-flight) ⭐ | Actual fetches transferring — should be hundreds, will be single digits. |
| 5 | [Q33](/altinity-kb-diagnostics-runbook/query-library/keeper-and-coordination/#q33-keeper-wait-time-and-activity-cumulative) | `ZooKeeperWaitMicroseconds` extremely high → Keeper saturation. |
| 6 | [Q42](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q42-partition-count-health) | Find the table with massive part count driving Keeper load. |
| 7 | [Q34](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q34-active-insert-sources-by-user) | Confirm ingestion is actually stopped. |

### Common root cause

Part fragmentation on one or more high-volume tables saturates Keeper
coordinating replication. Fetch tasks block waiting on Keeper responses;
the pool fills with waiting tasks while no transfers happen.

### Resolution path

1. Stop ingestion to the offending table.
2. Wait for merges to reduce part count (hours, not minutes).
3. Once parts collapse, Keeper pressure drops, fetches resume, queue
   drains.
4. Before resuming ingestion, fix the insert pattern — async inserts,
   larger batches, less granular partitioning.

**Do not** raise `background_fetches_pool_size`. The pool is not the
bottleneck — it's saturated by tasks waiting on Keeper, not by genuine
work. Adding pool slots adds more waiters.
