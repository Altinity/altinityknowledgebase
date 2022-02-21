---
title: "Description of asynchronous_metrics"
linkTitle: "Description of asynchronous_metrics"
weight: 100
description: >-
     Description of asynchronous_metrics
---

```
CompiledExpressionCacheCount    -- number or compiled cached expression (if CompiledExpressionCache is enabled)

jemalloc -- parameters of jemalloc allocator, they are not very useful, and not interesting

MarkCacheBytes / MarkCacheFiles  -- there are cache for .mrk files (default size is 5GB), you can see is it use all 5GB or not

MemoryCode  -- how much memory allocated for ClickHouse executable 

MemoryDataAndStack -- virtual memory allocated for data and stack

MemoryResident  -- real memory used by ClickHouse ( the same as top RES/RSS)

MemoryShared   -- shared memory used by ClickHouse

MemoryVirtual  -- virtual memory used by ClickHouse ( the same as top VIRT)

NumberOfDatabases

NumberOfTables

ReplicasMaxAbsoluteDelay -- important parameter - replica max absolute delay in seconds

ReplicasMaxRelativeDelay -- replica max relative delay (from other replicas) in seconds

ReplicasMaxInsertsInQueue  -- max number of parts to fetch for a single Replicated table

ReplicasSumInsertsInQueue  -- sum of parts to fetch for all Replicated tables

ReplicasMaxMergesInQueue  -- max number of merges in queue for a single Replicated table

ReplicasSumMergesInQueue  -- total number of merges in queue for all Replicated tables

ReplicasMaxQueueSize -- max number of tasks  for a single Replicated table 

ReplicasSumQueueSize -- total number of tasks in replication queue

UncompressedCacheBytes/UncompressedCacheCells  -- allocated memory for uncompressed cache (disabled by default)

Uptime     -- uptime seconds
```
