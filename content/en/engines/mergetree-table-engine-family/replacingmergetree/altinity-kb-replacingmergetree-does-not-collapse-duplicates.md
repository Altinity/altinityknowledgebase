---
title: "ReplacingMergeTree does not collapse duplicates"
linkTitle: "ReplacingMergeTree does not collapse duplicates"
description: >
    ReplacingMergeTree does not collapse duplicates
---
**Hi there, I have a question about replacing merge trees. I have set up a Materialized View with ReplacingMergeTree table, but even if I call optimize on it, the parts don't get merged. I filled that table yesterday, nothing happened since then. What should I do?**

Merges are eventual and may never happen. It depends on the number of inserts that happened after, the number of parts in the partition, size of parts.
If the total size of input parts are greater than the maximum part size then they will never be merged.

[https://clickhouse.tech/docs/en/operations/settings/merge-tree-settings/\#max-bytes-to-merge-at-max-space-in-pool](https://clickhouse.tech/docs/en/operations/settings/merge-tree-settings/#max-bytes-to-merge-at-max-space-in-pool)

[https://clickhouse.tech/docs/en/engines/table-engines/mergetree-family/replacingmergetree/](https://clickhouse.tech/docs/en/engines/table-engines/mergetree-family/replacingmergetree/)
_ReplacingMergeTree is suitable for clearing out duplicate data in the background in order to save space, but it doesn’t guarantee the absence of duplicates._
