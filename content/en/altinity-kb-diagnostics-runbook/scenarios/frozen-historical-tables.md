---
title: "Frozen historical tables adding background load"
linkTitle: "Frozen historical tables"
weight: 100
description: >
    Identifying old, no-longer-written tables whose partition count adds
    permanent Keeper coordination load.
keywords:
  - clickhouse partitions
  - keeper load
  - historical tables
  - partition cardinality
---

## Symptoms

- Old tables (previous-year or archive tables) showing high partition
  counts.
- Part counts high but stable — not growing.
- Background merge / Keeper traffic disproportionate to the active
  workload.

## Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q42](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q42-partition-count-health) ⭐ | Tables with extreme partition counts. |
| 2 | [Q40](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q40-active-inserts-confirmation-per-table-specific) | Confirm no recent writes — an empty result means the table is frozen. |
| 3 | [Q33](/altinity-kb-diagnostics-runbook/query-library/keeper-and-coordination/#q33-keeper-wait-time-and-activity-cumulative) | If `ZooKeeperList` is very high → confirms Keeper coordination overhead is the load source. |

## Resolution path

Frozen high-cardinality-partition tables don't cause acute incidents but
add permanent load. Options, ordered by lowest disruption:

1. **Drop** if the data is archived elsewhere.
2. **Detach old partitions** and **re-attach** them to a re-partitioned
   table with a sane partition key (`toYYYYMM(date)` for monthly,
   `toYYYYMMDD(date)` for daily on small datasets).
3. **Rebuild** the table with the sane partition key — only when neither
   of the above is feasible. Costly in time and disk.

The partition key choice is the schema-level fix; see
[How to pick an ORDER BY / PRIMARY KEY / PARTITION BY](/engines/mergetree-table-engine-family/pick-keys/)
for guidance.
