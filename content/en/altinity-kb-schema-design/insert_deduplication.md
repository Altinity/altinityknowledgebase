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
 
## Example

```sql
create table test_insert ( A Int64 ) 
Engine=ReplicatedMergeTree('/clickhouse/{cluster}/tables/test','{replica}') order by A;
 
insert into test_insert values(1);
insert into test_insert values(1);
insert into test_insert values(1);
insert into test_insert values(1);

select * from test_insert;
┌─A─┐
│ 1 │  -- only one row has been inserted, other were deduplicated
└───┘

alter table test_insert delete where 1;  -- that single row was removed

insert into test_insert values(1);

select * from test_insert;
0 rows in set. Elapsed: 0.001 sec.  -- the last insert was deduplicated again, 
                                    -- because `alter ... delete` does not clear deduplication checksums
                                    -- but `alter table drop partition` and `truncate` clear checksums
```

## insert_deduplicate setting

Insert deduplication is controled by [insert_deduplicate](https://clickhouse.com/docs/en/operations/settings/settings/#settings-insert-deduplicate) setting

Let's disable it:
```sql
set insert_deduplicate = 0;
insert into test_insert values(1);
insert into test_insert values(1);
insert into test_insert values(1);

select * from test_insert;
┌─A─┐
│ 1 │
└───┘
┌─A─┐
│ 1 │
└───┘
┌─A─┐
│ 1 │
└───┘

alter table test_insert delete where 1;

insert into test_insert values(1);
insert into test_insert values(1);

select * from test_insert;
┌─A─┐
│ 1 │
└───┘
┌─A─┐
│ 1 │
└───┘
```
 
Insert deduplication is a user-level setting, it can be disabled in a session or in user's profile (insert_deduplicate=0).
 
`clickhouse-client --insert_deduplicate=0 ....`

Disable insert_deduplicate by default for all queries

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

Deduplication checksums are stored in Zookeeper in `/blocks` table's znode for each partition separatly, so when you drop partition, they could be identified and removed for this partition.
(withing `alter table delete` it's impossible to match checksum, that's why checksums stay in Zookeeper)

More info: https://github.com/ClickHouse/ClickHouse/issues/16037 https://github.com/ClickHouse/ClickHouse/issues/3322

## Not replicated MergeTree tables

By default insert deduplication is disabled for not replicated tables (for backward compatibility).

It can be enabled by the [merge_tree](https://clickhouse.com/docs/en/operations/settings/merge-tree-settings/#merge-tree-settings) setting [non_replicated_deduplication_window](https://clickhouse.com/docs/en/operations/settings/merge-tree-settings/#non-replicated-deduplication-window).

Example:

```
create table test_insert ( A Int64 ) Engine=MergeTree order by A
settings non_replicated_deduplication_window = 100; -- 100 - how many last checksums to store
 
insert into test_insert values(1);
insert into test_insert values(1);
insert into test_insert values(1);
insert into test_insert values(2);
insert into test_insert values(2);

select * from test_insert;
┌─A─┐
│ 2 │
└───┘
┌─A─┐
│ 1 │
└───┘
```

In case of not replicated tables, deduplication checksums are stored in files in table's folder:

```bash
cat /var/lib/clickhouse/data/dw/test_insert/deduplication_logs/deduplication_log_1.txt
1	all_1_1_0	all_7615936253566048997_747463735222236827
1	all_4_4_0	all_636943575226146954_4277555262323907666
```

