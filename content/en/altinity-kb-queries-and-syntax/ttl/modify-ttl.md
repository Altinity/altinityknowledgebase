---
title: "MODIFY (ADD) TTL"
linkTitle: "MODIFY (ADD) TTL"
weight: 100
description: >-
     What happening during MODIFY or ADD TTL query. 
---

## ALTER TABLE tbl MODIFY (ADD) TTL:

It's 2 step process:

1. `ALTER TABLE tbl MODIFY (ADD) TTL ...`

Update table metadata: schema .sql & metadata in ZK.
It's usually cheap and fast command. And any new INSERT after schema change will calculate TTL according to new rule.


2. `ALTER TABLE tbl MATERIALIZE TTL`

Recalculate TTL for already exist parts.
It can be heavy operation, because ClickHouse will read column data & recalculate TTL & apply TTL expression.
You can disable this step completely by using `materialize_ttl_after_modify` user session setting (by default it's 1, so materialization is enabled).


```sql
ALTER TABLE tbl MODIFY TTL .... SETTINGS materialize_ttl_after_modify=0;
```

If you will disable materialization of TTL, it does mean that all old parts will be transformed according OLD TTL rules. 
MATERIALIZE TTL:

1. Recalculate TTL  (Kinda cheap, it read only column participate in TTL)
2. Apply TTL        (Rewrite of table data for all columns)

You also can disable apply TTL substep via `materialize_ttl_recalculate_only` merge_tree setting (by default it's 0, so clickhouse will apply TTL expression)

```sql
ALTER TABLE tbl MODIFY SETTINGS materialize_ttl_recalculate_only=1;
```

It does mean, that TTL rule will not be applied during `ALTER TABLE tbl MODIFY (ADD) TTL ...` query.

MATERIALIZE TTL done via Mutation:
1. ClickHouse create new parts via hardlinks and write new ttl.txt file
2. ClickHouse remove old(inactive) parts after remove time (default is 8 minutes) 

To stop materialization of TTL:

```sql
SELECT * FROM system.mutations WHERE is_done=0 AND table = 'tbl';
KILL MUTATION WHERE command LIKE '%MATERIALIZE TTL%' AND table = 'tbl'
```

### MODIFY TTL MOVE 

today: 2022-06-02

Table tbl

Daily partitioning by toYYYYMMDD(timestamp) -> 20220602

#### Increase of TTL

TTL timestamp + INTERVAL 30 DAY MOVE TO DISK s3 -> TTL timestamp + INTERVAL 60 DAY MOVE TO DISK s3

* Idea: ClickHouse need to move data from s3 to local disk BACK
* Actual: There is no rule that data eariler than 60 DAY **should be** on local disk

Table parts:

```
20220401    ttl: 20220501       disk: s3
20220416    ttl: 20220516       disk: s3
20220501    ttl: 20220531       disk: s3
20220502    ttl: 20220601       disk: local
20220516    ttl: 20220616       disk: local
20220601    ttl: 20220631       disk: local
```

```sql
ALTER TABLE tbl MODIFY TTL timestamp + INTERVAL 60 DAY MOVE TO DISK s3;
```

Table parts:

```
20220401    ttl: 20220601       disk: s3
20220416    ttl: 20220616       disk: s3
20220501    ttl: 20220631       disk: s3        (ClickHouse will not move this part to local disk, because there is no TTL rule for that)
20220502    ttl: 20220701       disk: local
20220516    ttl: 20220716       disk: local
20220601    ttl: 20220731       disk: local
```

#### Decrease of TTL

TTL timestamp + INTERVAL 30 DAY MOVE TO DISK s3 -> TTL timestamp + INTERVAL 14 DAY MOVE TO DISK s3

Table parts:

```
20220401    ttl: 20220401       disk: s3
20220416    ttl: 20220516       disk: s3
20220501    ttl: 20220531       disk: s3        
20220502    ttl: 20220601       disk: local     
20220516    ttl: 20220616       disk: local
20220601    ttl: 20220631       disk: local
```

```sql
ALTER TABLE tbl MODIFY TTL timestamp + INTERVAL 14 DAY MOVE TO DISK s3;
```

Table parts:

```
20220401    ttl: 20220415       disk: s3
20220416    ttl: 20220501       disk: s3
20220501    ttl: 20220515       disk: s3
20220502    ttl: 20220517       disk: local     (ClickHouse will move this part to disk s3 in background according to TTL rule)
20220516    ttl: 20220601       disk: local     (ClickHouse will move this part to disk s3 in background according to TTL rule)
20220601    ttl: 20220616       disk: local
```

### Possible TTL Rules

TTL:
```
DELETE          (With enabled `ttl_only_drop_parts`, it's cheap operation, ClickHouse will drop the whole part)
MOVE
GROUP BY
WHERE
RECOMPRESS
```

Related settings:

Server settings:

```
background_move_processing_pool_thread_sleep_seconds                        |   10      |
background_move_processing_pool_thread_sleep_seconds_random_part            |   1.0     |
background_move_processing_pool_thread_sleep_seconds_if_nothing_to_do       |   0.1     |
background_move_processing_pool_task_sleep_seconds_when_no_work_min         |   10      |
background_move_processing_pool_task_sleep_seconds_when_no_work_max         |   600     |
background_move_processing_pool_task_sleep_seconds_when_no_work_multiplier  |   1.1     |
background_move_processing_pool_task_sleep_seconds_when_no_work_random_part |   1.0     |
```

MergeTree settings:

```
merge_with_ttl_timeout                      │   14400   │       0 │ Minimal time in seconds, when merge with delete TTL can be repeated.
merge_with_recompression_ttl_timeout        │   14400   │       0 │ Minimal time in seconds, when merge with recompression TTL can be repeated.
max_replicated_merges_with_ttl_in_queue     │   1       │       0 │ How many tasks of merging parts with TTL are allowed simultaneously in ReplicatedMergeTree queue.
max_number_of_merges_with_ttl_in_pool       │   2       │       0 │ When there is more than specified number of merges with TTL entries in pool, do not assign new merge with TTL. This is to leave free threads for regular merges and avoid "Too many parts"
ttl_only_drop_parts                         │   0       │       0 │ Only drop altogether the expired parts and not partially prune them.
```

Session settings:

```
materialize_ttl_after_modify                │   1       │       0 │ Apply TTL for old data, after ALTER MODIFY TTL query 
```
