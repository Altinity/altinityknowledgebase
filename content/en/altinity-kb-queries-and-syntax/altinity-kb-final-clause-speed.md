---
title: "FINAL clause speed"
linkTitle: "FINAL clause speed"
description: >
    FINAL clause speed
---
`SELECT * FROM table FINAL`

### History

* Before ClickHouse® 20.5 - always executed in a single thread and slow.
* Since 20.5  - final can be parallel, see [https://github.com/ClickHouse/ClickHouse/pull/10463](https://github.com/ClickHouse/ClickHouse/pull/10463)
* Since 20.10 - you can use `do_not_merge_across_partitions_select_final` setting. See [https://github.com/ClickHouse/ClickHouse/pull/15938](https://github.com/ClickHouse/ClickHouse/pull/15938) and [https://github.com/ClickHouse/ClickHouse/issues/11722](https://github.com/ClickHouse/ClickHouse/issues/11722)
* Since 22.6  - final even more parallel, see [https://github.com/ClickHouse/ClickHouse/pull/36396](https://github.com/ClickHouse/ClickHouse/pull/36396)
* Since 23.2  - `WHERE` conditions on the sorting key are moved to `PREWHERE` for FINAL queries, see [https://github.com/ClickHouse/ClickHouse/pull/38950](https://github.com/ClickHouse/ClickHouse/pull/38950); `final=1` setting applies FINAL to every table
* Since 23.3  - final doesn't read excessive data, see [https://github.com/ClickHouse/ClickHouse/pull/47801](https://github.com/ClickHouse/ClickHouse/pull/47801)
* Since 23.5  - final use less memory, see [https://github.com/ClickHouse/ClickHouse/pull/50429](https://github.com/ClickHouse/ClickHouse/pull/50429)
* Since 23.9  - final doesn't read PK columns if unneeded ie only one part in partition, see [https://github.com/ClickHouse/ClickHouse/pull/53919](https://github.com/ClickHouse/ClickHouse/pull/53919)
* Since 23.12 - final applied only for intersecting ranges of parts, see [https://github.com/ClickHouse/ClickHouse/pull/58120](https://github.com/ClickHouse/ClickHouse/pull/58120)
* Since 23.12 - `do_not_merge_across_partitions_select_final` is derived automatically when the partition key uses only primary key columns, see [https://github.com/ClickHouse/ClickHouse/pull/58218](https://github.com/ClickHouse/ClickHouse/pull/58218)
* Since 24.1  - final doesn't compare rows from the same part with level > 0, see [https://github.com/ClickHouse/ClickHouse/pull/58142](https://github.com/ClickHouse/ClickHouse/pull/58142)
* Since 24.1  - final use vertical algorithm (more cache friendly), see [https://github.com/ClickHouse/ClickHouse/pull/54366](https://github.com/ClickHouse/ClickHouse/pull/54366). Disabled in 24.5 because of a bug, re-enabled in 24.6.
* Since 24.2  - `split_parts_ranges_into_intersecting_and_non_intersecting_final` and `split_intersecting_parts_ranges_into_layers_final` settings allow disabling the 23.12 optimization, see [https://github.com/ClickHouse/ClickHouse/pull/59705](https://github.com/ClickHouse/ClickHouse/pull/59705)
* Since 25.1  - with `optimize_on_insert` parts are written at level 1, so the same-part optimizations also apply to fresh parts, see [https://github.com/ClickHouse/ClickHouse/pull/73132](https://github.com/ClickHouse/ClickHouse/pull/73132)
* Since 25.5  - `use_skip_indexes_if_final_exact_mode` added; since 25.6 FINAL uses skip indexes (`use_skip_indexes_if_final=1` by default)
* Since 25.10 - faster FINAL on ReplacingMergeTree with `is_deleted`, see [https://github.com/ClickHouse/ClickHouse/pull/88090](https://github.com/ClickHouse/ClickHouse/pull/88090)
* Since 25.12 - `apply_row_policy_after_final` and `apply_prewhere_after_final` settings (applied after deduplication); row policy default is 1 in 25.12, 0 in 26.1 and 1 from 26.2
* Since 26.2  - `enable_automatic_decision_for_merging_across_partitions_for_final=1` by default (auto-enables cross-partition optimization when safe)
* Since 26.3  - FINAL no longer prunes partitions by `WHERE` (a stale row could win otherwise). Opt-out: `defer_partition_pruning_after_final=0`, useful when one key never spans partitions, see [https://github.com/ClickHouse/ClickHouse/pull/104705](https://github.com/ClickHouse/ClickHouse/pull/104705)
* Since 26.4  - `query_plan_optimize_lazy_final` (**off by default**), see "Lazy FINAL and lazy materialization" below
* Since 26.6  - `FINAL` on the left-most table of a `JOIN` no longer applies to the other joined tables; `analyzer_compatibility_apply_final_to_all_joined_tables=1` (added in 26.4) restores the old behaviour
* Since 26.7  - default lazy materialization also applies to `FINAL` + filter + small `LIMIT` without `ORDER BY` (backported to 26.5.6+ and 26.6.2+ per the PR; checked in 26.5.7 and 26.6.8, absent in 26.4), see [https://github.com/ClickHouse/ClickHouse/pull/110722](https://github.com/ClickHouse/ClickHouse/pull/110722)
* Since 26.9  - ReplacingMergeTree FINAL can read in reverse order (`ORDER BY key DESC LIMIT n`), see [https://github.com/ClickHouse/ClickHouse/pull/115345](https://github.com/ClickHouse/ClickHouse/pull/115345)
* Since 26.10 - `optimize_move_to_prewhere_if_final=1` by default; faster skip-index exact mode with small granules, see [https://github.com/ClickHouse/ClickHouse/pull/121799](https://github.com/ClickHouse/ClickHouse/pull/121799)


### Partitioning

Proper partition design could speed up FINAL processing.

For example, if you have a table with Daily partitioning, you can:
- After day end + some time interval during which you can get some updates run `OPTIMIZE TABLE xxx PARTITION 'prev_day' FINAL`
- or add table SETTINGS min_age_to_force_merge_seconds=86400,min_age_to_force_merge_on_partition_only=1
  
In that case, using FINAL with `do_not_merge_across_partitions_select_final` will be cheap or even zero.

Example:

```sql
DROP TABLE IF EXISTS repl_tbl;

CREATE TABLE repl_tbl
(
    `key` UInt32,
    `val_1` UInt32,
    `val_2` String,
    `val_3` String,
    `val_4` String,
    `val_5` UUID,
    `ts` DateTime
)
ENGINE = ReplacingMergeTree(ts)
PARTITION BY toDate(ts)
ORDER BY key;

​
INSERT INTO repl_tbl SELECT number as key, rand() as val_1, randomStringUTF8(10) as val_2, randomStringUTF8(5) as val_3, randomStringUTF8(4) as val_4, generateUUIDv4() as val_5, '2020-01-01 00:00:00' as ts FROM numbers(10000000);
OPTIMIZE TABLE repl_tbl PARTITION ID '20200101' FINAL;
INSERT INTO repl_tbl SELECT number as key, rand() as val_1, randomStringUTF8(10) as val_2, randomStringUTF8(5) as val_3, randomStringUTF8(4) as val_4, generateUUIDv4() as val_5, '2020-01-02 00:00:00' as ts FROM numbers(10000000);
OPTIMIZE TABLE repl_tbl PARTITION ID '20200102' FINAL;
INSERT INTO repl_tbl SELECT number as key, rand() as val_1, randomStringUTF8(10) as val_2, randomStringUTF8(5) as val_3, randomStringUTF8(4) as val_4, generateUUIDv4() as val_5, '2020-01-03 00:00:00' as ts FROM numbers(10000000);
OPTIMIZE TABLE repl_tbl PARTITION ID '20200103' FINAL;
INSERT INTO repl_tbl SELECT number as key, rand() as val_1, randomStringUTF8(10) as val_2, randomStringUTF8(5) as val_3, randomStringUTF8(4) as val_4, generateUUIDv4() as val_5, '2020-01-04 00:00:00' as ts FROM numbers(10000000);
OPTIMIZE TABLE repl_tbl PARTITION ID '20200104' FINAL;

SYSTEM STOP MERGES repl_tbl;
INSERT INTO repl_tbl SELECT number as key, rand() as val_1, randomStringUTF8(10) as val_2, randomStringUTF8(5) as val_3, randomStringUTF8(4) as val_4, generateUUIDv4() as val_5, '2020-01-05 00:00:00' as ts FROM numbers(10000000);
​

SELECT count() FROM repl_tbl WHERE NOT ignore(*)

┌──count()─┐
│ 50000000 │
└──────────┘

1 rows in set. Elapsed: 1.504 sec. Processed 50.00 million rows, 6.40 GB (33.24 million rows/s., 4.26 GB/s.)

SELECT count() FROM repl_tbl FINAL WHERE NOT ignore(*)

┌──count()─┐
│ 10000000 │
└──────────┘

1 rows in set. Elapsed: 3.314 sec. Processed 50.00 million rows, 6.40 GB (15.09 million rows/s., 1.93 GB/s.)

/* more that 2 time slower, and will get worse once you will have more data */

set do_not_merge_across_partitions_select_final=1;

SELECT count() FROM repl_tbl FINAL WHERE NOT ignore(*)

┌──count()─┐
│ 50000000 │
└──────────┘

1 rows in set. Elapsed: 1.850 sec. Processed 50.00 million rows, 6.40 GB (27.03 million rows/s., 3.46 GB/s.)

/* only 0.35 sec slower, and while partitions have about the same size that extra cost will be about constant */

```

Since 26.2, `enable_automatic_decision_for_merging_across_partitions_for_final=1` (default) auto-enables this when partition key columns are included in PRIMARY KEY

### Light ORDER BY 

All columns specified in ORDER BY will be read during FINAL processing, creating additional disk load.  Use fewer columns and lighter column types to create faster queries.

Example: UUID vs UInt64
```
CREATE TABLE uuid_table (id UUID, value UInt64)    ENGINE = ReplacingMergeTree() ORDER BY id;
CREATE TABLE uint64_table (id UInt64,value UInt64) ENGINE = ReplacingMergeTree() ORDER BY id;

INSERT INTO uuid_table SELECT generateUUIDv4(), number FROM numbers(5E7);
INSERT INTO uint64_table SELECT number, number         FROM numbers(5E7);

SELECT sum(value) FROM uuid_table   FINAL format JSON;
SELECT sum(value) FROM uint64_table FINAL format JSON;
```
[Results](https://fiddle.clickhouse.com/e2441e5d-ccb6-4f67-bee0-7cc2c4e3f43e):
```
		"elapsed": 0.58738197,
		"rows_read": 50172032,
		"bytes_read": 1204128768

		"elapsed": 0.189792142,
		"rows_read": 50057344,
		"bytes_read": 480675040
```

### Vertical FINAL Algorithm (24.1+)

When `enable_vertical_final=1` (default since 24.1, except 24.5 where it was disabled due to a bug), ClickHouse uses a different deduplication strategy:
- Marks duplicate rows as deleted instead of merging them immediately
- Filters deleted rows in a later processing step
- Reads different columns from different parts in parallel

This improves performance for queries that read only a subset of columns, as non-ORDER BY columns can be read independently from different parts.

### PREWHERE and Row Policies with FINAL (25.12+)

Row policies are applied **after** FINAL by default (`apply_row_policy_after_final=1`; 25.12 and 26.2+, 26.1 had 0). PREWHERE is by default applied **before** FINAL deduplication. This can cause incorrect results when:
- PREWHERE references columns that differ across duplicate rows
- Row policies should filter based on the "winning" row values after deduplication

Use these settings when needed:
- `apply_prewhere_after_final=1` - Apply PREWHERE after deduplication
- `apply_row_policy_after_final=1` - Apply row policies after deduplication

Example problem: if you have `ReplacingMergeTree` with a `deleted` column and PREWHERE filters on it, without `apply_prewhere_after_final=1` you may get wrong results because PREWHERE sees rows before FINAL picks the winner.

### FINAL with skip indexes

- `use_skip_indexes_if_final` and `use_skip_indexes_if_final_exact_mode` are enabled by default since 25.6 (exact mode was added in 25.5).
- Skip indexes on PRIMARY KEY columns have lower overhead (no extra primary-key intersection check since 25.11), see [PR 88368](https://github.com/ClickHouse/ClickHouse/pull/88368).
- Exact mode adds a recovery pass that also reads granules of other parts overlapping the selected ones, so a newer row version is never missed. Before 26.10 its cost grew with the **total** number of granules; since 26.10 it grows with the **selected** granules ([PR 121799](https://github.com/ClickHouse/ClickHouse/pull/121799)). Results and selected granules are identical. In our test (8M rows, 40 unmerged parts, selective index) it gave 4x at `index_granularity=8` (417 → 103 ms), 1.3x at 64 and nothing at the default 8192; the index type does not matter.
- Check that the index pays off: when it matches about 1 row in 200, exact mode was slower than `use_skip_indexes_if_final=0`. Compare both with `EXPLAIN indexes = 1`.

### Lazy FINAL and lazy materialization

Two different optimizations are easy to confuse:

- **Lazy column materialization** (`query_plan_optimize_lazy_materialization`, on by default): read only the filter and FINAL-merge columns first, fetch the rest for the rows that survive `LIMIT`. Since 26.7 it also works for `FINAL` + `WHERE`/`PREWHERE` + `LIMIT` **without** `ORDER BY`. It needs a filter and `LIMIT` up to `query_plan_max_limit_for_lazy_materialization` (10000); look for `JoinLazyColumnsStep` in `EXPLAIN`. On wide tables (3 x `String(200)`, `SELECT * ... WHERE f = 7 LIMIT 10`) it cut the data read from 899 MB to 98 MB and the time from ~106 ms to ~28 ms; no gain with narrow columns, one part, or `LIMIT 100000`.
- **Lazy FINAL** (`query_plan_optimize_lazy_final`, off by default since 26.4) re-reads the table by a primary key set built from the filtered rows. It helps only when the filter prunes marks (a contiguous key range or a unique id, no small `LIMIT`: ~430 → ~25 ms) and is slower when many rows match (+30-45% at 10-50% selectivity without `LIMIT`, up to 5x with `LIMIT 1`). Keep it off otherwise.

Tested on 26.4, 26.7, 26.8 and 26.10 with identical results in all combinations (including Nullable primary key, `is_deleted` with PREWHERE, text index filter). Caches were warm, so cold-disk gains may be larger.

### Gotchas

- **24.5:** `enable_vertical_final` was off by default due to a bug; fixed in 24.6.
- **SummingMergeTree:** `SELECT ... FINAL` keeps rows whose summed columns are all zero, while background merges and `OPTIMIZE ... FINAL` remove them. In 25.8 the row count also depended on the columns selected (`count()` returned 2, `SELECT a` returned 1 for the same data); this is consistent in 26.8+ (changelog entry for 26.10: [PR 115032](https://github.com/ClickHouse/ClickHouse/pull/115032)).
- **Partition pruning (26.3+):** `WHERE` on the partition key is not used to prune partitions under FINAL, see `defer_partition_pruning_after_final` above.


### Settings reference

| Setting | Default | Since | Description |
|---------|---------|-------|-------------|
| `do_not_merge_across_partitions_select_final` | 0 | 20.10 | Skip cross-partition merging when partitions are pre-optimized |
| `max_final_threads` | 0 (auto) | 20.5 | Thread limit for FINAL processing |
| `enable_vertical_final` | 1 | 24.1 | Read columns in parallel from different parts |
| `use_skip_indexes_if_final` | 1 | 25.6 | Allow skip indexes with FINAL |
| `use_skip_indexes_if_final_exact_mode` | 1 | 25.5 (default 25.6) | Rescan newer parts to ensure correctness with skip indexes |
| `apply_prewhere_after_final` | 0 | 25.12 | Apply PREWHERE after deduplication (needed when PREWHERE references non-PK columns) |
| `apply_row_policy_after_final` | 1 | 25.12 (0 in 26.1) | Apply row policies after deduplication |
| `optimize_move_to_prewhere_if_final` | 1 | 23.2 (default 1 since 26.10) | Move sorting-key conditions to PREWHERE for FINAL queries |
| `defer_partition_pruning_after_final` | 1 | 26.3 | Skip partition pruning under FINAL; set 0 only if a key never spans partitions |
| `analyzer_compatibility_apply_final_to_all_joined_tables` | 0 | 26.4 (default 0 since 26.6) | Apply FINAL on the left-most JOIN table to all joined tables |
| `query_plan_optimize_lazy_final` | 0 | 26.4 | Re-read FINAL data by a primary key set from filtered rows; helps for clustered key ranges / unique ids only |
| `query_plan_optimize_lazy_materialization` | 1 | 26.7 for FINAL + LIMIT without ORDER BY | Fetch non-filter columns only for rows that survive `LIMIT` |
| `enable_automatic_decision_for_merging_across_partitions_for_final` | 1 | 26.2 | Auto-enable `do_not_merge_across_partitions_select_final` when partition key is in PK |
