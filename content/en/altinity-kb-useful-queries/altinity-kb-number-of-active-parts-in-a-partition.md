---
title: "Number of active parts in a partition"
linkTitle: "Number of active parts in a partition"
description: >
    Number of active parts in a partition
---
## Q: Why do I have several active parts in a partition? Why ClickHouse does not merge them immediately?

### A: CH does not merge parts by time

Merge scheduler selects parts by own algorithm based on the current node workload / number of parts / size of parts.

CH merge scheduler balances between a big number of parts and a wasting resources on merges.

Merges are CPU/DISK IO expensive. If CH will merge every new part then all resources will be spend on merges and will no resources remain on queries (selects ).

CH will not merge parts with a combined size greater than 100 GB.

```
SELECT
    database,
    table,
    partition,
    sum(rows) AS rows,
    count() AS part_count
FROM system.parts
WHERE (active = 1) AND (table LIKE '%') AND (database LIKE '%')
GROUP BY
    database,
    table,
    partition
ORDER BY part_count DESC
limit 20
```
