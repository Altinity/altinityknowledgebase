---
title: "Converting MergeTree to Replicated"
linkTitle: "Converting MergeTree to Replicated"
description: >
    Adding replication to a table
keywords: 
  - clickhouse replicatedmergetree
  - clickhouse replicated
---
To enable replication in a table that uses the `MergeTree` engine, you need to convert the engine to `ReplicatedMergeTree`. Options here are:

1. Use`INSERT INTO foo_replicated SELECT * FROM foo`. (suitable for small tables)
2. Create table aside and attach all partition from the existing table then drop original table (uses hard links don't require extra disk space). `ALTER TABLE foo_replicated ATTACH PARTITION ID 'bar' FROM 'foo'` You can easily auto generate those commands using a query like: `SELECT DISTINCT 'ALTER TABLE foo_replicated ATTACH PARTITION ID \'' || partition_id || '\' FROM foo;' from system.parts WHERE table = 'foo';` See [the example below](#example-for-option-2-above) for details. 
3. Do it 'in place' using some file manipulation. see the procedure described here: [https://clickhouse.tech/docs/en/engines/table-engines/mergetree-family/replication/\#converting-from-mergetree-to-replicatedmergetree](https://clickhouse.tech/docs/en/engines/table-engines/mergetree-family/replication/#converting-from-mergetree-to-replicatedmergetree)
4. Do a backup of MergeTree and recover as ReplicatedMergeTree. [https://github.com/Altinity/clickhouse-backup/blob/master/Examples.md\#how-to-convert-mergetree-to-replicatedmegretree](https://github.com/Altinity/clickhouse-backup/blob/master/Examples.md#how-to-convert-mergetree-to-replicatedmegretree)
5. Embedded command for recent Clickhouse versions - https://clickhouse.com/docs/en/sql-reference/statements/attach#attach-mergetree-table-as-replicatedmergetree

## Example for option 2 above

Note: `ATTACH PARTITION ID 'bar' FROM 'foo'` is practically free from a compute and disk space perspective. This feature utilizes filesystem hard-links and the fact that files are immutable in ClickHouse® (it's the core of the ClickHouse design, filesystem hard-links and such file manipulations are widely used).

```sql
create table foo( A Int64, D Date, S String ) 
Engine MergeTree 
partition by toYYYYMM(D) order by A;

insert into foo select number, today(), '' from numbers(1e8);
insert into foo select number, today()-60, '' from numbers(1e8);

select count() from foo;
┌───count()─┐
│ 200000000 │
└───────────┘

create table foo_replicated as foo 
Engine ReplicatedMergeTree('/clickhouse/{cluster}/tables/{database}/{table}/{shard}','{replica}')
partition by toYYYYMM(D) order by A;

SYSTEM STOP MERGES;

SELECT DISTINCT 'ALTER TABLE foo_replicated ATTACH PARTITION ID \'' || partition_id || '\' FROM foo;' from system.parts WHERE table = 'foo' AND active;
┌─concat('ALTER TABLE foo_replicated ATTACH PARTITION ID \'', partition_id, '\' FROM foo;')─┐
│ ALTER TABLE foo_replicated ATTACH PARTITION ID '202111' FROM foo;                         │
│ ALTER TABLE foo_replicated ATTACH PARTITION ID '202201' FROM foo;                         │
└───────────────────────────────────────────────────────────────────────────────────────────┘

clickhouse-client -q "SELECT DISTINCT 'ALTER TABLE foo_replicated ATTACH PARTITION ID \'' || partition_id || '\' FROM foo;' from system.parts WHERE table = 'foo' format TabSeparatedRaw" |clickhouse-client -mn

SYSTEM START MERGES;

SELECT count() FROM foo_replicated;
┌───count()─┐
│ 200000000 │
└───────────┘

rename table foo to foo_old, foo_replicated to foo;

-- you can drop foo_old any time later, it's kinda a cheap backup, 
-- it cost nothing until you insert a lot of additional data into foo_replicated
```
