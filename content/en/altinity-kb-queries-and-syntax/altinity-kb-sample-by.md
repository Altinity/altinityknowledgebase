---
title: "SAMPLE by"
linkTitle: "SAMPLE by"
description: >
    SAMPLE by
---
The execution pipeline is embedded in the partition reading code.

So that works this way:

1. ClickHouse does partition pruning based on `WHERE` conditions.
2. For every partition, it picks a columns ranges (aka 'marks' / 'granulas') based on primary key conditions.
3. Here the sampling logic is applied: a) in case of `SAMPLE k` (`k` in `0..1` range) it adds conditions `WHERE sample_key < k * max_int_of_sample_key_type` b) in case of `SAMPLE k OFFSET m` it adds conditions `WHERE sample_key BETWEEN m * max_int_of_sample_key_type AND (m + k) * max_int_of_sample_key_type`c) in case of `SAMPLE N` (N>1) if first estimates how many rows are inside the range we need to read and based on that convert it to 3a case (calculate k based on number of rows in ranges and desired number of rows)
4. on the data returned by those other conditions are applied (so here the number of rows can be decreased here)

[Source Code](https://github.com/ClickHouse/ClickHouse/blob/92c937db8b50844c7216d93c5c398d376e82f6c3/src/Storages/MergeTree/MergeTreeDataSelectExecutor.cpp#L355)

## SAMPLE by

[Docs](https://clickhouse.yandex/docs/en/query_language/select/#select-sample-clause)
[Source Code](https://github.com/ClickHouse/ClickHouse/blob/92c937db8b50844c7216d93c5c398d376e82f6c3/src/Storages/MergeTree/MergeTreeDataSelectExecutor.cpp#L355)

SAMPLE key
Must be:

* Included in the primary key.
* Uniformly distributed in the domain of its data type:
  * **Bad**: Timestamp;
  * **Good**: intHash32(UserID);
* Cheap to calculate:
  * **Bad**: cityHash64(URL);
  * **Good**: intHash32(UserID);
* Not after high granular fields in primary key:
  * **Bad**: ORDER BY (Timestamp, sample_key);
  * **Good**: ORDER BY (CounterID, Date, sample_key).

Sampling is:

* Deterministic
* Works in a consistent way for different tables.
* Allows reading less amount of data from disk.
  * SAMPLE key, bonus
  * SAMPLE 1/10
  * Select data for 1/10 of all possible sample keys; SAMPLE 1000000
* Select from about (not less than) 1 000 000 rows on each shard;
  * You can use _sample_factor virtual column to determine the relative sample factor; SAMPLE 1/10 OFFSET 1/10
* Select second 1/10 of all possible sample keys; SET max_parallel_replicas = 3
* Select from multiple replicas of each shard in parallel;

## SAMPLE emulation via WHERE condition

Sometimes, it's easier to emulate sampling via conditions in WHERE clause instead of using SAMPLE key.

```
SELECT count() FROM table WHERE ... AND cityHash64(some_high_card_key) % 10 = 0; -- Deterministic
SELECT count() FROM table WHERE ... AND rand() % 10 = 0; -- Non-deterministic
```

ClickHouse will read more data from disk compared to an example with a good SAMPLE key, but it's more universal and can be used if you can't change table ORDER BY key.