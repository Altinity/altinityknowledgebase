---
title: "Merge Shards"
linkTitle: "Desharding"
description: >
    Marge many Shards to one
---

(draft, not tested)

# ClickHouse migration plan: merge 11 shards into 1 using `clickhouse-backup`

Your migration approach is workable with one important pattern:

* restore **schema once**
* restore **local-table data shard by shard** into `detached`
* run `ALTER TABLE ... ATTACH PART` to attach restored parts
* recreate or adjust **Distributed** tables for the new 1-shard topology

This plan assumes:

* all 11 shards use schema-compatible local tables
* all backups are taken from a consistent point in time
* the target cluster is already built as a 1-shard environment
* `Distributed` tables are treated as routing/query objects, not as the physical data source

Relevant references:

* `clickhouse-backup` README: [https://github.com/Altinity/clickhouse-backup/blob/master/ReadMe.md](https://github.com/Altinity/clickhouse-backup/blob/master/ReadMe.md)
* `clickhouse-backup` changelog: [https://github.com/Altinity/clickhouse-backup/blob/master/ChangeLog.md](https://github.com/Altinity/clickhouse-backup/blob/master/ChangeLog.md)
* Replication docs: [https://clickhouse.com/docs/engines/table-engines/mergetree-family/replication](https://clickhouse.com/docs/engines/table-engines/mergetree-family/replication)
* Distributed engine docs: [https://clickhouse.com/docs/engines/table-engines/special/distributed](https://clickhouse.com/docs/engines/table-engines/special/distributed)
* Detached parts docs: [https://clickhouse.com/docs/operations/system-tables/detached_parts](https://clickhouse.com/docs/operations/system-tables/detached_parts)

## Diagnosis

The safest migration pattern is:

1. take one backup per shard
2. build the new 1-shard target cluster
3. restore schema once from a single shard backup
4. restore **only local-table data** from each shard backup using `--replicated-copy-to-detached`
5. attach detached parts after each shard restore
6. recreate or validate `Distributed` tables for the new cluster layout
7. validate row counts, parts, and detached leftovers

I would **not** restore all 11 shard backups first and attach later. It is safer to process one shard backup at a time:

* restore to detached
* attach parts
* validate
* continue with the next shard

## Migration sequence

### 1) Take backups on all 11 source shards

Use one backup per shard and keep shard identity in the backup name.

Examples:

```text
shard01_20260319_full
shard02_20260319_full
...
shard11_20260319_full
```

Example commands:

```text
clickhouse-backup create_remote shard01_20260319_full
clickhouse-backup create_remote shard02_20260319_full
clickhouse-backup create_remote shard03_20260319_full
```

Notes:

* run `clickhouse-backup` on the same host or pod as ClickHouse, because it needs filesystem access
* keep writes stopped or otherwise guarantee a consistent backup window across all shards

## 2) Prepare the new single-shard target

Before restoring anything:

* create the new cluster definition
* set correct macros for the new topology
* verify Keeper paths for replicated tables
* verify storage policies and disk layout

For `Replicated*MergeTree`, Keeper paths must be correct for the **new** 1-shard layout.

## 3) Restore schema once

Restore schema from **one** shard backup only.

Example:

```text
clickhouse-backup restore_remote --schema shard01_20260319_full
```

You should restore schema only once because the table definitions are expected to be identical across shards.

Practical recommendation:

* restore databases and local tables once
* then recreate `Distributed` tables later so they point to the new 1-shard cluster

## 4) Restore local-table data shard by shard into `detached`

Use `--replicated-copy-to-detached` so the restore copies data into `detached` instead of trying to attach parts automatically.

Example for all local tables in both databases:

```text
clickhouse-backup restore_remote \
  --data \
  --tables="db1.*_local,db2.*_local" \
  --replicated-copy-to-detached \
  shard01_20260319_full
```

Example for a smaller test subset:

```text
clickhouse-backup restore_remote \
  --data \
  --tables="db1.events_local,db1.sessions_local,db2.fact_local" \
  --replicated-copy-to-detached \
  shard01_20260319_full
```

Notes:

* restore **local** tables only
* do not rely on `Distributed` tables for the data merge
* process one shard backup at a time

## 5) Attach detached parts

After each shard restore, inspect `system.detached_parts` and attach the parts into the target local tables.

Attach a known part:

```sql
ALTER TABLE `db1`.`events_local` ATTACH PART '202603_12_12_0';
```

Generate attach statements for all detached parts in the two databases:

```sql
SELECT concat(
    'ALTER TABLE `', database, '`.`', table,
    '` ATTACH PART ', quoteString(name), ';'
) AS attach_sql
FROM system.detached_parts
WHERE database IN ('db1', 'db2')
  AND ifNull(reason, '') = ''
ORDER BY database, table, partition_id, min_block_number, max_block_number, name;
```

Inventory detached parts before and after attach:

```sql
SELECT
    database,
    table,
    reason,
    count() AS parts,
    formatReadableSize(sum(bytes_on_disk)) AS total_bytes
FROM system.detached_parts
WHERE database IN ('db1', 'db2')
GROUP BY database, table, reason
ORDER BY database, table, reason;
```

Validate active data after attach:

```sql
SELECT
    database,
    table,
    sum(rows) AS rows,
    formatReadableSize(sum(bytes_on_disk)) AS total_bytes
FROM system.parts
WHERE active
  AND database IN ('db1', 'db2')
GROUP BY database, table
ORDER BY database, table;
```

## 6) Recreate `Distributed` tables for the new 1-shard cluster

After all local-table data is loaded, recreate or adjust `Distributed` tables so they point to the new cluster layout.

Example:

```sql
DROP TABLE IF EXISTS `db1`.`events`;
```

```sql
CREATE TABLE `db1`.`events` AS `db1`.`events_local`
ENGINE = Distributed('cluster_1shard', 'db1', 'events_local', cityHash64(user_id));
```

This step is important because `Distributed` tables are query-routing objects, not the physical source of merged shard data.

## 7) Validation checklist

Before opening writes on the new cluster:

* compare row counts by table
* compare bytes on disk by table
* inspect `system.detached_parts` for leftovers
* inspect replication health if tables remain replicated
* validate that all `Distributed` tables point to the new cluster definition
* run smoke-test queries against both databases

## Recommended operating pattern

For your case with two databases and around 50 tables total:

* separate **local tables** from **Distributed tables**
* restore schema once
* restore local data shard by shard
* attach parts after each shard
* recreate `Distributed` tables last

That is the most predictable way to merge 11 shards into 1 with `clickhouse-backup`.

## Important caveats

* do not restore all shard backups to `detached` first and postpone all attaches until the end
* do not restore schema 11 times
* verify Keeper paths and macros carefully when moving from 11 shards to 1
* test the full flow on a few representative large tables before running the complete migration
* treat any remaining entries in `system.detached_parts` as something to review explicitly

## Minimal command examples

Create backup:

```text
clickhouse-backup create_remote shard01_20260319_full
```

Restore schema once:

```text
clickhouse-backup restore_remote --schema shard01_20260319_full
```

Restore local-table data to detached:

```text
clickhouse-backup restore_remote \
  --data \
  --tables="db1.*_local,db2.*_local" \
  --replicated-copy-to-detached \
  shard01_20260319_full
```

Attach one detached part:

```sql
ALTER TABLE `db1`.`events_local` ATTACH PART '202603_12_12_0';
```

Generate all attach commands:

```sql
SELECT concat(
    'ALTER TABLE `', database, '`.`', table,
    '` ATTACH PART ', quoteString(name), ';'
) AS attach_sql
FROM system.detached_parts
WHERE database IN ('db1', 'db2')
  AND ifNull(reason, '') = ''
ORDER BY database, table, partition_id, min_block_number, max_block_number, name;
```

## Bash script template

This is a production-style skeleton you can adapt.

```aiexclude
#!/usr/bin/env bash
set -euo pipefail

CH_CLIENT="${CH_CLIENT:-clickhouse-client --multiquery}"
CH_BACKUP="${CH_BACKUP:-clickhouse-backup}"

# Backups from 11 source shards
BACKUPS=(
  shard01_20260319_full
  shard02_20260319_full
  shard03_20260319_full
  shard04_20260319_full
  shard05_20260319_full
  shard06_20260319_full
  shard07_20260319_full
  shard08_20260319_full
  shard09_20260319_full
  shard10_20260319_full
  shard11_20260319_full
)

# Databases to migrate
DATABASES=(
  db1
  db2
)

# Local tables only.
# Keep Distributed tables out of this list.
LOCAL_TABLE_PATTERNS=(
  "db1.*_local"
  "db2.*_local"
)

join_by_comma() {
  local IFS=","
  echo "$*"
}

LOCAL_TABLES_CSV="$(join_by_comma "${LOCAL_TABLE_PATTERNS[@]}")"

echo "== Step 1: restore schema once from first shard backup =="
${CH_BACKUP} restore_remote --schema "${BACKUPS[0]}"

echo "== Step 2: process shard backups one by one =="
for backup in "${BACKUPS[@]}"; do
  echo "---- restoring data to detached from backup: ${backup}"
  ${CH_BACKUP} restore_remote \
    --data \
    --tables="${LOCAL_TABLES_CSV}" \
    --replicated-copy-to-detached \
    "${backup}"

  echo "---- attaching detached parts created by ${backup}"
  ${CH_CLIENT} --query "
    SELECT concat(
      'ALTER TABLE `', database, '`.`', table,
      '` ATTACH PART ', quoteString(name), ';'
    )
    FROM system.detached_parts
    WHERE database IN ('db1', 'db2')
      AND ifNull(reason, '') = ''
    ORDER BY database, table, partition_id, min_block_number, max_block_number, name
    FORMAT TSVRaw
  " | while IFS= read -r stmt; do
      echo "${stmt}"
      ${CH_CLIENT} --query "${stmt}"
    done

  echo "---- post-attach detached inventory"
  ${CH_CLIENT} --query "
    SELECT
      database,
      table,
      reason,
      count() AS parts
    FROM system.detached_parts
    WHERE database IN ('db1', 'db2')
    GROUP BY database, table, reason
    ORDER BY database, table, reason
  "
done

echo "== Step 3: final validation =="
${CH_CLIENT} --query "
  SELECT database, table, sum(rows) AS rows, formatReadableSize(sum(bytes_on_disk)) AS bytes
  FROM system.parts
  WHERE active
    AND database IN ('db1', 'db2')
  GROUP BY database, table
  ORDER BY database, table
"

echo "Migration load phase completed."
```
