---
title: "Clean up orphaned objects on s3"
linkTitle: "Clean up orphaned objects on s3"
weight: 100
description: >-
     Clean up orphaned objects left in an S3-backed ClickHouse tiered‐storage
---

### Problems

- TRUNCATE and DROP TABLE remove **metadata only**.
- Long-running queries, merges or other replicas may still reference parts, so ClickHouse delays removal.
- There are bugs in Clickhouse that leave orphaned files, especially after failures.

### Solutions

- use our utility for garbage collection - https://github.com/Altinity/s3gc
- or create a separate path in the bucket for every table and every replica and remove the whole path in AWS console
- you can also use [clickhouse-disk](https://clickhouse.com/docs/operations/utilities/clickhouse-disks) utility to delete s3 data:

```
clickhouse-disks --disk s3 --query "remove /cluster/database/table/replica1"
```



