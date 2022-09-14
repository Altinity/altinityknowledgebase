---
title: "Insert Deduplication / Insert idempotency"
linkTitle: "insert deduplication"
weight: 100
description: >-
     Insert Deduplication / Insert idempotency , insert_deduplicate setting.
---

# Insert Deduplication

Replicated tables have a special feature insert deduplication (enabled by default).

[Documentation:](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/replication/)
_Data blocks are deduplicated. For multiple writes of the same data block (data blocks of the same size containing the same rows in the same order), the block is only written once. The reason for this is in case of network failures when the client application does not know if the data was written to the DB, so the INSERT query can simply be repeated. It does not matter which replica INSERTs were sent to with identical data. INSERTs are idempotent. Deduplication parameters are controlled by merge_tree server settings._
 
### Example

```sql
create table test_insert ( A Int64 ) 
Engine=ReplicatedMergeTree('/clickhouse/cluster_test/tables/{table}','{replica}') 
order by A;
 
insert into test_insert values(1);
insert into test_insert values(1);
insert into test_insert values(1);
insert into test_insert values(1);

select * from test_insert;
┌─A─┐
│ 1 │                                       -- only one row has been inserted, the other rows were deduplicated
└───┘

alter table test_insert delete where 1;    -- that single row was removed

insert into test_insert values(1);

select * from test_insert;
0 rows in set. Elapsed: 0.001 sec.         -- the last insert was deduplicated again, 
                                           -- because `alter ... delete` does not clear deduplication checksums
                                           -- only `alter table drop partition` and `truncate` clear checksums
```

In `clickhouse-server.log` you may see trace messages `Block with ID ... already exists locally as part ... ignoring it`
```
# cat /var/log/clickhouse-server/clickhouse-server.log|grep test_insert|grep Block
..17:52:45.064974.. Block with ID all_7615936253566048997_747463735222236827 already exists locally as part all_0_0_0; ignoring it.
..17:52:45.068979.. Block with ID all_7615936253566048997_747463735222236827 already exists locally as part all_0_0_0; ignoring it.
..17:52:45.072883.. Block with ID all_7615936253566048997_747463735222236827 already exists locally as part all_0_0_0; ignoring it.
..17:52:45.076738.. Block with ID all_7615936253566048997_747463735222236827 already exists locally as part all_0_0_0; ignoring it.
```

Deduplication checksums are stored in Zookeeper in `/blocks` table's znode for each partition separately, so when you drop partition, they could be identified and removed for this partition.
(during `alter table delete` it's impossible to match checksums, that's why checksums stay in Zookeeper).
```sql
SELECT name, value
FROM system.zookeeper
WHERE path = '/clickhouse/cluster_test/tables/test_insert/blocks'
┌─name───────────────────────────────────────┬─value─────┐
│ all_7615936253566048997_747463735222236827 │ all_0_0_0 │
└────────────────────────────────────────────┴───────────┘
```

## insert_deduplicate setting

Insert deduplication is controled by the [insert_deduplicate](https://clickhouse.com/docs/en/operations/settings/settings/#settings-insert-deduplicate) setting

Let's disable it:
```sql
set insert_deduplicate = 0;              -- insert_deduplicate is now disabled in this session

insert into test_insert values(1);
insert into test_insert values(1);
insert into test_insert values(1);

select * from test_insert format PrettyCompactMonoBlock;
┌─A─┐
│ 1 │
│ 1 │
│ 1 │                                   -- all 3 insterted rows are in the table
└───┘

alter table test_insert delete where 1;

insert into test_insert values(1);
insert into test_insert values(1);

select * from test_insert format PrettyCompactMonoBlock;
┌─A─┐
│ 1 │
│ 1 │
└───┘
```
 
Insert deduplication is a user-level setting, it can be disabled in a session or in a user's profile (insert_deduplicate=0).
 
`clickhouse-client --insert_deduplicate=0 ....`

How to disable `insert_deduplicate` by default for all queries:
```xml
# cat /etc/clickhouse-server/users.d/insert_deduplicate.xml
<?xml version="1.0"?>
<yandex>
    <profiles>
        <default>
            <insert_deduplicate>0</insert_deduplicate>
        </default>
    </profile
</yandex>    
```

Other related settings: [replicated_deduplication_window](https://clickhouse.com/docs/en/operations/settings/merge-tree-settings/#replicated-deduplication-window), [replicated_deduplication_window_seconds](https://clickhouse.com/docs/en/operations/settings/merge-tree-settings/#replicated-deduplication-window-seconds), [insert_deduplication_token](https://clickhouse.com/docs/en/operations/settings/settings/#insert_deduplication_token).

More info: https://github.com/ClickHouse/ClickHouse/issues/16037 https://github.com/ClickHouse/ClickHouse/issues/3322

## Non-replicated MergeTree tables

By default insert deduplication is disabled for non-replicated tables (for backward compatibility).

It can be enabled by the [merge_tree](https://clickhouse.com/docs/en/operations/settings/merge-tree-settings/#merge-tree-settings) setting [non_replicated_deduplication_window](https://clickhouse.com/docs/en/operations/settings/merge-tree-settings/#non-replicated-deduplication-window).

Example:

```sql
create table test_insert ( A Int64 ) 
Engine=MergeTree 
order by A
settings non_replicated_deduplication_window = 100;          -- 100 - how many latest checksums to store
 
insert into test_insert values(1);
insert into test_insert values(1);
insert into test_insert values(1);

insert into test_insert values(2);
insert into test_insert values(2);

select * from test_insert format PrettyCompactMonoBlock;
┌─A─┐
│ 2 │
│ 1 │
└───┘
```

In case of non-replicated tables deduplication checksums are stored in files in the table's folder:

```bash
cat /var/lib/clickhouse/data/default/test_insert/deduplication_logs/deduplication_log_1.txt
1	all_1_1_0	all_7615936253566048997_747463735222236827
1	all_4_4_0	all_636943575226146954_4277555262323907666
```

## Checksums calculation

Checksums are calculated not from the inserted data but from formed parts.

Insert data is separated to parts by table's partitioning. 

Parts contain rows sorted by the table's `order by` and all values of functions (i.e. `now()`) or Default/Materialized columns are expanded.

### Example with partial insertion because of partitioning:
```sql
create table test_insert ( A Int64, B Int64 ) 
Engine=MergeTree 
partition by B 
order by A
settings non_replicated_deduplication_window = 100;  


insert into test_insert values (1,1);
insert into test_insert values (1,1)(1,2);

select * from test_insert format PrettyCompactMonoBlock;
┌─A─┬─B─┐
│ 1 │ 1 │
│ 1 │ 2 │                                   -- the second insert was skipped for only one partition!!!
└───┴───┘
```

### Example with deduplication despite the rows order:
```sql
drop table test_insert;

create table test_insert ( A Int64, B Int64 ) 
Engine=MergeTree 
order by (A, B)
settings non_replicated_deduplication_window = 100;  

insert into test_insert values (1,1)(1,2);
insert into test_insert values (1,2)(1,1);  -- the order of rows is not equal with the first insert

select * from test_insert format PrettyCompactMonoBlock;
┌─A─┬─B─┐
│ 1 │ 1 │
│ 1 │ 2 │
└───┴───┘
2 rows in set. Elapsed: 0.001 sec.          -- the second insert was skipped despite the rows order
```

### Example to demonstrate how Default/Materialize columns are expanded:
```sql
drop table test_insert;

create table test_insert ( A Int64, B Int64 Default rand() ) 
Engine=MergeTree 
order by A
settings non_replicated_deduplication_window = 100;

insert into test_insert(A) values (1);                 -- B calculated as  rand()
insert into test_insert(A) values (1);                 -- B calculated as  rand()

select * from test_insert format PrettyCompactMonoBlock;
┌─A─┬──────────B─┐
│ 1 │ 3467561058 │
│ 1 │ 3981927391 │
└───┴────────────┘

insert into test_insert(A, B) values (1, 3467561058);  -- B is not calculated / will be deduplicated

select * from test_insert format PrettyCompactMonoBlock;
┌─A─┬──────────B─┐
│ 1 │ 3981927391 │
│ 1 │ 3467561058 │
└───┴────────────┘
```


### Example to demonstrate how functions are expanded:
```sql
drop table test_insert;
create table test_insert ( A Int64, B DateTime64 ) 
Engine=MergeTree 
order by A
settings non_replicated_deduplication_window = 100;

insert into test_insert values (1, now64());
....
insert into test_insert values (1, now64());

select * from test_insert format PrettyCompactMonoBlock;
┌─A─┬───────────────────────B─┐
│ 1 │ 2022-01-31 15:43:45.364 │
│ 1 │ 2022-01-31 15:43:41.944 │
└───┴─────────────────────────┘
```

## insert_deduplication_token

Since Clikhouse 22.2 there is a new setting [insert_dedupplication_token](https://clickhouse.com/docs/en/operations/settings/settings/#insert_deduplication_token).
This setting allows you to define an explicit token that will be used for deduplication instead of calculating a checksum from the inserted data.

```sql
CREATE TABLE test_table
( A Int64 )
ENGINE = MergeTree
ORDER BY A
SETTINGS non_replicated_deduplication_window = 100;

INSERT INTO test_table SETTINGS insert_deduplication_token = 'test' VALUES (1);

-- the next insert won't be deduplicated because insert_deduplication_token is different
INSERT INTO test_table SETTINGS insert_deduplication_token = 'test1' VALUES (1);

-- the next insert will be deduplicated because insert_deduplication_token 
-- is the same as one of the previous
INSERT INTO test_table SETTINGS insert_deduplication_token = 'test' VALUES (2);
SELECT * FROM test_table
┌─A─┐
│ 1 │
└───┘
┌─A─┐
│ 1 │
└───┘
```
