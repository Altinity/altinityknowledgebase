---
title: "High Memory Usage During Merge in system.metric_log"
linkTitle: "Merge Memory in metric_log"
weight: 100
description: >-
    Resolving excessive memory consumption during merges in the ClickHouse® system.metric_log table.
---

## Overview

In recent versions of ClickHouse®, the **merge process (part compaction)** in the `system.metric_log` table can consume a large amount of memory.
The issue arises due to an **unfortunate combination of settings**, where:

* the merge is already large enough to produce **wide parts**,
* but not yet large enough to enable **vertical merges**.

This problem has become more pronounced in newer ClickHouse® versions because the `system.metric_log` table has **expanded significantly** — many new metrics were added, increasing the total number of columns.

> **Wide vs Compact** — storage formats for table parts:
> * *Wide* — each column is stored in a separate file (more efficient for large datasets).
> * *Compact* — all data is stored in a single file (more efficient for small inserts).
>
> **Horizontal vs Vertical merge** — algorithms for combining data during merges:
> * *Horizontal merge* reads and merges all columns at once — meaning all files are opened simultaneously, and buffers are allocated for each column and each part.
> * *Vertical merge* processes columns in batches — first merging only columns from `ORDER BY`, then the rest one by one. This approach **significantly reduces memory usage**.

The most memory-intensive scenario is a **horizontal merge of wide parts** in a table with a large number of columns.

---

## Demonstrating the Problem

The issue can be reproduced easily by adjusting a few settings:

```sql
ALTER TABLE system.metric_log MODIFY SETTING min_bytes_for_wide_part = 100;
OPTIMIZE TABLE system.metric_log FINAL;
````

Example log output:

```
[c9d66aa9f9d1] 2025.11.10 10:04:59.091067 [97] <Debug> MemoryTracker: Background process (mutate/merge) peak memory usage: 6.00 GiB.
```

**The merge consumed 6 GB of memory** — far too much for this table.

---

## Vertical Merges Are Not Affected

If you explicitly force vertical merges, memory consumption normalizes, although the process becomes slightly slower:

```sql
ALTER TABLE system.metric_log MODIFY SETTING 
    min_bytes_for_wide_part = 100,
    vertical_merge_algorithm_min_rows_to_activate = 1;

OPTIMIZE TABLE system.metric_log FINAL;
```

Example log output:

```
[c9d66aa9f9d1] 2025.11.10 10:06:14.575832 [97] <Debug> MemoryTracker: Background process (mutate/merge) peak memory usage: 13.98 MiB.
```

Now memory usage **drops from 6 GB to only 14 MB**.

---

## Root Cause

The problem stems from the fact that:

* the threshold for enabling *wide* parts is configured in **bytes** (`min_bytes_for_wide_part`);
* while the threshold for enabling *vertical merges* is configured in **rows** (`vertical_merge_algorithm_min_rows_to_activate`).

When a table contains very **wide rows** (many lightweight columns), this mismatch causes wide parts to appear too early, while vertical merges are triggered much later.

---

## Default Settings

| Parameter                                        | Value            |
| ------------------------------------------------ | ---------------- |
| `vertical_merge_algorithm_min_rows_to_activate`  | 131072           |
| `vertical_merge_algorithm_min_bytes_to_activate` | 0                |
| `min_bytes_for_wide_part`                        | 10485760 (10 MB) |
| `min_rows_for_wide_part`                         | 0                |

The average row size in `metric_log` is approximately **2.8 KB**, meaning wide parts are created after roughly:

```
10485760 / 2800 ≈ 3744 rows
```

Meanwhile, the vertical merge algorithm activates only after **131 072 rows** — much later.

---

## Possible Solutions

1. **Increase `min_bytes_for_wide_part`**
   For example, set it to at least `2800 * 131072 ≈ 350 MB`.
   This delays the switch to the wide format until vertical merges can also be used.

2. **Switch to a row-based threshold**
   Use `min_rows_for_wide_part` instead of `min_bytes_for_wide_part`.

3. **Lower the threshold for vertical merges**
   Reduce `vertical_merge_algorithm_min_rows_to_activate`,
   or add a value for `vertical_merge_algorithm_min_bytes_to_activate`.

---

## Example Local Fix for `metric_log`

Apply the configuration below, then restart ClickHouse® and drop the `metric_log` table (so it will be recreated with the updated settings):

```xml
<metric_log replace="1">
    <database>system</database>
    <table>metric_log</table>
    <engine>
        ENGINE = MergeTree
        PARTITION BY (event_date)
        ORDER BY (event_time)
        TTL event_date + INTERVAL 14 DAY DELETE
        SETTINGS min_bytes_for_wide_part = 536870912;
    </engine>
    <flush_interval_milliseconds>7500</flush_interval_milliseconds>
</metric_log>
```

This configuration increases the threshold for wide parts to **512 MB**, preventing premature switching to the wide format and reducing memory usage during merges.

The PR [#89811](https://github.com/ClickHouse/ClickHouse/pull/89811) introduces a similar improvement.

---

## Global Fix (All Tables)

In addition to `metric_log`, other tables may also be affected — particularly those with **average row sizes greater than ~80 bytes** and **hundreds of columns**.

```xml
<clickhouse>
  <merge_tree>
    <min_bytes_for_wide_part>134217728</min_bytes_for_wide_part>
    <vertical_merge_algorithm_min_bytes_to_activate>134217728</vertical_merge_algorithm_min_bytes_to_activate>
  </merge_tree>
</clickhouse>
```

These settings tell ClickHouse® to **keep using compact parts longer**
and to **enable the vertical merge algorithm** simultaneously with the switch to the wide format, preventing sudden spikes in memory usage.

---

### ⚠️ Potential Risks and Trade-offs

Raising `min_bytes_for_wide_part` globally keeps more data in **compact parts**, which can both help and hurt depending on workload. Compact parts store all columns in a single `data.bin` file — this makes **inserts much faster**, especially for tables with **many columns**, since fewer files are created per part. It’s also a big advantage when storing data on **S3 or other object storage**, where every extra file adds latency and increases API call counts.

The trade-off is that this layout makes **reads less efficient** for column-selective queries. Reading one or two columns from a large compact part means scanning and decompressing shared blocks instead of isolated files. It can also reduce cache locality, slightly worsen compression (different columns compressed together), and make **mutations or ALTERs** more expensive because each change rewrites the entire part.

Lowering thresholds for vertical merges further decreases merge memory but may make the first merges slower, as they process columns sequentially. This configuration works best for **wide, append-only tables** or **S3-based storage**, while analytical tables with frequent updates or narrow schemas may perform better with defaults. If merge memory or S3 request overhead is your main concern, applying it globally is reasonable — otherwise, start with specific wide tables like `system.metric_log`, verify performance improvements, and expand gradually.

---

✅ **Summary**

The root issue is a mismatch between byte-based and row-based thresholds for wide parts and vertical merges.
Aligning these values — by adjusting one or both parameters — stabilizes memory usage and prevents excessive RAM consumption during merges in `system.metric_log` and similar tables.
