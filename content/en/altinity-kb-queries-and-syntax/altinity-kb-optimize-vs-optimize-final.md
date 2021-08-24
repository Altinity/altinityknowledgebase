---
title: "OPTIMIZE vs OPTIMIZE FINAL"
linkTitle: "OPTIMIZE vs OPTIMIZE FINAL"
description: >
    OPTIMIZE vs OPTIMIZE FINAL
---
`OPTIMIZE TABLE xyz` -- this initiates an unscheduled merge.

## Example

You have 40 parts in 3 partitions. This unscheduled merge selects some partition (i.e. February) and selects 3 small parts to merge, then merge them into a single part. You get 38 parts in the result.

`OPTIMIZE TABLE xyz FINAL` -- initiates a cycle of unscheduled merges.

ClickHouse merges parts in this table until will remains 1 part in each partition (if a system has enough free disk space). As a result, you get 3 parts, 1 part per partition. In this case, CH rewrites parts even if they are already merged into a single part. It creates a huge CPU / Disk load if the table ( XYZ) is huge. ClickHouse reads / uncompress / merge / compress / writes all data in the table.

If this table has size 1TB it could take around 3 hours to complete.

So we don't recommend running `OPTIMIZE TABLE xyz FINAL` against tables with more than 10million rows.
