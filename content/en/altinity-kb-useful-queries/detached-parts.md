---
title: "Can detached parts in ClickHouse® be dropped?"
linkTitle: "Can detached parts be dropped?"
description: >
    Cleaning up detached parts without data loss
keywords: 
  - clickhouse detached parts
  - clickhouse detach
  - clickhouse drop partition
---

### Overview

This article explains detached parts in ClickHouse®: why they appear, what detached reasons mean, and how to clean up safely.

Use it when investigating:

- missing data after startup/replication incidents,
- read-only replicas caused by broken parts,
- disk growth under `.../detached/`.

For manual `ALTER ... DETACH PART|PARTITION`, detached parts are expected and may be reattached later.

### Version Scope

Primary scope: **ClickHouse 23.10+**.

Compatibility note:

- In **22.6-23.9**, there was optional timeout-based auto-removal for some detached reasons.
- In **23.10+**, this option was removed; detached-part cleanup is intentionally manual.

### Detached Reasons and Actions

`system.detached_parts.reason` is `Nullable(String)`:

- empty string usually means user-detached part (`ALTER ... DETACH ...`),
- `NULL` often indicates invalid/unparseable detached part names (investigate separately).

| Reason | Typical meaning | Default action |
| --- | --- | --- |
| `ignored` | Local part present but not expected in Keeper after startup checks | Usually safe to drop **after** coverage validation |
| `clone` | Replica cloning conflict handling | Usually safe to drop **after** coverage validation |
| `attaching` | Temporary state during ATTACH | Do not touch while operation is active |
| `deleting` | Temporary state during DROP DETACHED | Do not touch while operation is active |
| `tmp-fetch` | Temporary fetch directory from replication | Investigate stale entries; usually temporary |
| `broken` / `broken-on-start` | Checksums/files/format problems | Investigate root cause first |
| `covered-by-broken` | Ancestor/covered generation detached during broken-part handling | Drop only after healthy replacement is confirmed |
| `noquorum` | Quorum insert failed | Validate data durability before cleanup |
| `merge-not-byte-identical` / `mutate-not-byte-identical` | Replica equality check mismatch | Investigate replica consistency and versions |
| `broken-from-backup` | RESTORE copied broken part to detached | Investigate backup integrity and restore settings |
| `''` (empty) | User-detached part | Candidate for attach/drop per operational intent |
| `NULL` | Invalid name metadata parse | Handle as edge case; avoid blind bulk drop |

### Important Behavior Notes

- `DROP DETACHED` requires `allow_drop_detached=1` at query/session/profile level.
- Prefer SQL cleanup (`ALTER TABLE ... DROP DETACHED ...`) over manual filesystem deletion.
- For ReplicatedMergeTree, correlate with `system.replicas` and replication queue state before dropping anything.
- Keep server logs; detached reasons are often easiest to explain from `clickhouse-server.log`.

### Quick Inventory Queries

```sql
SELECT
    database,
    table,
    reason,
    count() AS parts
FROM system.detached_parts
GROUP BY database, table, reason
ORDER BY database ASC, table ASC, reason ASC
```

```sql
SELECT
    database,
    table,
    reason,
    count() AS parts,
    formatReadableSize(sum(bytes_on_disk)) AS total_bytes,
    min(modification_time) AS oldest,
    max(modification_time) AS newest
FROM system.detached_parts
GROUP BY database, table, reason
ORDER BY sum(bytes_on_disk) DESC, parts DESC
```

```sql
SELECT metric, value
FROM system.asynchronous_metrics
WHERE metric IN ('NumberOfDetachedParts', 'NumberOfDetachedByUserParts')
ORDER BY metric
```

### Edge-Case Detector (invalid detached names)

```sql
SELECT
    database,
    table,
    name,
    reason,
    partition_id,
    min_block_number,
    max_block_number,
    level,
    path,
    modification_time
FROM system.detached_parts
WHERE partition_id IS NULL
   OR min_block_number IS NULL
   OR max_block_number IS NULL
ORDER BY modification_time DESC
```

### Safe Cleanup Workflow (SQL-first)

1. Inventory detached parts by reason and size.
2. Check replica health and queue state.
3. Validate part coverage for "usually safe" reasons (`ignored`, `clone`).
4. Drop with `ALTER ... DROP DETACHED ... SETTINGS allow_drop_detached=1`.

Check replica health first:

```sql
SELECT
    database,
    table,
    is_readonly,
    absolute_delay,
    queue_size,
    last_queue_update_exception
FROM system.replicas
WHERE is_readonly
   OR queue_size > 0
   OR last_queue_update_exception != ''
ORDER BY absolute_delay DESC, queue_size DESC
```

Generate safe-drop candidates for covered `ignored` / `clone` parts:

```sql
SELECT
    d.database,
    d.table,
    d.name,
    d.reason,
    concat(
      'ALTER TABLE `', d.database, '`.`', d.table,
      '` DROP DETACHED PART ', quoteString(d.name),
      ' SETTINGS allow_drop_detached=1;'
    ) AS drop_sql
FROM system.detached_parts d
INNER JOIN system.parts p
    ON d.database = p.database
   AND d.table = p.table
   AND d.partition_id = p.partition_id
WHERE p.active
  AND d.reason IN ('ignored', 'clone')
  AND d.min_block_number >= p.min_block_number
  AND d.max_block_number <= p.max_block_number
ORDER BY d.database, d.table, d.name
```

### `DROP DETACHED` Syntax

```sql
ALTER TABLE table_name [ON CLUSTER cluster] DROP DETACHED PARTITION|PART ALL|partition_expr
```

Examples:

```sql
ALTER TABLE db.tbl DROP DETACHED PART '202502_10_10_0' SETTINGS allow_drop_detached=1;
ALTER TABLE db.tbl DROP DETACHED PARTITION ID '202502' SETTINGS allow_drop_detached=1;
ALTER TABLE db.tbl DROP DETACHED PARTITION ALL SETTINGS allow_drop_detached=1;
```

### Recovery Recipes

Attach user-detached parts (`reason = ''`):

```sql
SELECT
    database,
    table,
    name,
    concat(
      'ALTER TABLE `', database, '`.`', table,
      '` ATTACH PART ', quoteString(name), ';'
    ) AS attach_sql
FROM system.detached_parts
WHERE ifNull(reason, '') = ''
ORDER BY database, table, name
```

Find stale temporary prefixes:

```sql
SELECT database, table, name, reason, modification_time
FROM system.detached_parts
WHERE reason IN ('attaching', 'deleting', 'tmp-fetch')
  AND modification_time < now() - INTERVAL 15 MINUTE
ORDER BY modification_time
```

### Rare but Important Edge Cases

1. **Invalid detached part names with `_tryN` suffixes** can produce `NULL` parsing metadata in `system.detached_parts`; treat these as a separate cleanup track.
2. **Older versions had DROP DETACHED issues on ReplicatedMergeTree over S3 (without zero-copy)**; this was fixed in 2023.
3. **Startup handling of unexpected parts was improved** to restore closer ancestors instead of random covered parts.
4. **Downgrade workflows may fail to ATTACH `broken-on-start_*` directly** in some versions. Workaround is manual rename then attach:

```sql
SELECT
    concat('mv ', path, ' ', replace(path, 'broken-on-start_', '')) AS mv_cmd
FROM system.detached_parts
WHERE startsWith(name, 'broken-on-start_')
```

Use this workaround only when standard `ATTACH PART` fails and after validating target version behavior.

### References

- ClickHouse docs: [Manipulating Partitions and Parts](https://clickhouse.com/docs/sql-reference/statements/alter/partition)
- ClickHouse docs: [system.detached_parts](https://clickhouse.com/docs/operations/system-tables/detached_parts)
- ClickHouse source (detached reasons): [MergeTreePartInfo.h](https://github.com/ClickHouse/ClickHouse/blob/master/src/Storages/MergeTree/MergeTreePartInfo.h)
- Changelog 2022 (`22.6`, detached timeout cleanup introduced): [clickhouse-docs 2022 changelog](https://github.com/ClickHouse/clickhouse-docs/blob/main/docs/whats-new/changelog/2022.md)
- Changelog 2023 (`23.10`, auto-removal option removed): [clickhouse-docs 2023 changelog](https://github.com/ClickHouse/clickhouse-docs/blob/main/docs/whats-new/changelog/2023.md)
- Relevant GH issues/PRs:
  - [#37975](https://github.com/ClickHouse/ClickHouse/pull/37975),
  - [#55184](https://github.com/ClickHouse/ClickHouse/pull/55184),
  - [#55309](https://github.com/ClickHouse/ClickHouse/pull/55309),
  - [#55645](https://github.com/ClickHouse/ClickHouse/pull/55645),
  - [#53877](https://github.com/ClickHouse/ClickHouse/pull/53877),
  - [#54506](https://github.com/ClickHouse/ClickHouse/pull/54506),
  - [#40031](https://github.com/ClickHouse/ClickHouse/pull/40031),
  - [#37466](https://github.com/ClickHouse/ClickHouse/issues/37466),
  - [#58509](https://github.com/ClickHouse/ClickHouse/issues/58509),
  - [#68408](https://github.com/ClickHouse/ClickHouse/issues/68408),
  - [#85351](https://github.com/ClickHouse/ClickHouse/issues/85351)
