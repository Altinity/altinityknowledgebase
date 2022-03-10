---
title: "Part names & MVCC"
linkTitle: "Part names & MVCC"
weight: 100
description: >-
     Part names & multiversion concurrency control.
---

## Part names & multiversion concurrency control

Part name format is:
```
<partitionid>_<min_block_number>_<max_block_number>_<level>_<data_version>
```

system.parts contains all the information parsed.

partitionid is quite simple (it just comes from your partitioning key).

What are block_numbers?

```
DROP TABLE IF EXISTS part_names;
create table part_names (date Date, n UInt8, m UInt8) engine=MergeTree PARTITION BY toYYYYMM(date) ORDER BY n;

insert into part_names VALUES (now(), 0, 0);
select name, partition_id, min_block_number, max_block_number, level, data_version from system.parts where table = 'part_names' and active;
┌─name─────────┬─partition_id─┬─min_block_number─┬─max_block_number─┬─level─┬─data_version─┐
│ 202203_1_1_0 │ 202203       │                1 │                1 │     0 │            1 │
└──────────────┴──────────────┴──────────────────┴──────────────────┴───────┴──────────────┘

insert into part_names VALUES (now(), 0, 0);
select name, partition_id, min_block_number, max_block_number, level, data_version from system.parts where table = 'part_names' and active;
┌─name─────────┬─partition_id─┬─min_block_number─┬─max_block_number─┬─level─┬─data_version─┐
│ 202203_1_1_0 │ 202203       │                1 │                1 │     0 │            1 │
│ 202203_2_2_0 │ 202203       │                2 │                2 │     0 │            2 │
└──────────────┴──────────────┴──────────────────┴──────────────────┴───────┴──────────────┘

insert into part_names VALUES (now(), 0, 0);
select name, partition_id, min_block_number, max_block_number, level, data_version from system.parts where table = 'part_names' and active;
┌─name─────────┬─partition_id─┬─min_block_number─┬─max_block_number─┬─level─┬─data_version─┐
│ 202203_1_1_0 │ 202203       │                1 │                1 │     0 │            1 │
│ 202203_2_2_0 │ 202203       │                2 │                2 │     0 │            2 │
│ 202203_3_3_0 │ 202203       │                3 │                3 │     0 │            3 │
└──────────────┴──────────────┴──────────────────┴──────────────────┴───────┴──────────────┘
```

As you can see every insert creates a new incremental block_number which is written in part names both as <min_block_number> and <min_block_number>
(and the level is 0 meaning that the part was never merged).

Those block numbering works in the scope of partition (for Replicated table) or globally across all partition (for plain MergeTree table).

ClickHouse always merge only continuous blocks . And new part names always refer to the minimum and maximum block numbers.

```
OPTIMIZE TABLE part_names;

┌─name─────────┬─partition_id─┬─min_block_number─┬─max_block_number─┬─level─┬─data_version─┐
│ 202203_1_3_1 │ 202203       │                1 │                3 │     1 │            1 │
└──────────────┴──────────────┴──────────────────┴──────────────────┴───────┴──────────────┘
```

As you can see here - three parts (with block number 1,2,3) were merged and they formed the new part with name 1_3 as min/max block size.
Level get incremented.

Now even while previous (merged) parts still exists in filesystem for a while (as inactive) clickhouse is smart enough to understand
that new part 'covers' same range of blocks as 3 parts of the prev 'generation'

There might be a fifth section in the part name, data version.

Data version gets increased when a part mutates.

Every mutation takes one block number:

```
insert into part_names VALUES (now(), 0, 0);
insert into part_names VALUES (now(), 0, 0);
insert into part_names VALUES (now(), 0, 0);

select name, partition_id, min_block_number, max_block_number, level, data_version from system.parts where table = 'part_names' and active;

┌─name─────────┬─partition_id─┬─min_block_number─┬─max_block_number─┬─level─┬─data_version─┐
│ 202203_1_3_1 │ 202203       │                1 │                3 │     1 │            1 │
│ 202203_4_4_0 │ 202203       │                4 │                4 │     0 │            4 │
│ 202203_5_5_0 │ 202203       │                5 │                5 │     0 │            5 │
│ 202203_6_6_0 │ 202203       │                6 │                6 │     0 │            6 │
└──────────────┴──────────────┴──────────────────┴──────────────────┴───────┴──────────────┘

insert into part_names VALUES (now(), 0, 0);

alter table part_names update m=n where 1;

select name, partition_id, min_block_number, max_block_number, level, data_version from system.parts where table = 'part_names' and active;

┌─name───────────┬─partition_id─┬─min_block_number─┬─max_block_number─┬─level─┬─data_version─┐
│ 202203_1_3_1_7 │ 202203       │                1 │                3 │     1 │            7 │
│ 202203_4_4_0_7 │ 202203       │                4 │                4 │     0 │            7 │
│ 202203_5_5_0_7 │ 202203       │                5 │                5 │     0 │            7 │
│ 202203_6_6_0_7 │ 202203       │                6 │                6 │     0 │            7 │
│ 202203_8_8_0   │ 202203       │                8 │                8 │     0 │            8 │
└────────────────┴──────────────┴──────────────────┴──────────────────┴───────┴──────────────┘

OPTIMIZE TABLE part_names;

select name, partition_id, min_block_number, max_block_number, level, data_version from system.parts where table = 'part_names' and active;
┌─name───────────┬─partition_id─┬─min_block_number─┬─max_block_number─┬─level─┬─data_version─┐
│ 202203_1_8_2_7 │ 202203       │                1 │                8 │     2 │            7 │
└────────────────┴──────────────┴──────────────────┴──────────────────┴───────┴──────────────┘
```
