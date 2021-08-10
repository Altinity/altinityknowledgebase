---
title: "Recovering from complete metadata loss in ZooKeeper"
linkTitle: "Recovering from complete metadata loss in ZooKeeper"
description: >
    Recovering from complete metadata loss in ZooKeeper
---

## Problem <a id="Recoveringfromcompletemetadatalossinzookeeper-Problem"></a>

Every ClickHouse user experienced a loss of ZooKeeper one day. While the data is available and replicas respond to queries, inserts are no longer possible. ClickHouse uses ZooKeeper in order to store the reference version of the table structure and part of data, and when it is not available can not guarantee data consistency anymore. Replicated tables turn to the read-only mode. In this article we describe step-by-step instructions of how to restore ZooKeeper metadata and bring ClickHouse cluster back to normal operation.

In order to restore ZooKeeper we have to solve two tasks. First, we need to restore table metadata in ZooKeeper. Currently, the only way to do it is to recreate the table with the `CREATE TABLE DDL` statement.

```sql
CREATE TABLE table_name ... ENGINE=ReplicatedMergeTree('zookeeper_path','replica_name');
```

The second and more difficult task is to populate zookeeper with information of clickhouse data parts. As mentioned above, ClickHouse stores the reference data about all parts of replicated tables in ZooKeeper, so we have to traverse all partitions and re-attach them to the recovered replicated table in order to fix that.

## Test case <a id="Recoveringfromcompletemetadatalossinzookeeper-Testcase"></a>

Let's say we have replicated table `table_repl`.

```sql
CREATE TABLE table_repl 
(
   `number` UInt32
)
ENGINE = ReplicatedMergeTree('/clickhouse/{cluster}/tables/{shard}/table_repl','{replica}')
PARTITION BY intDiv(number, 1000)
ORDER BY number;
```

And populate it with some data

```sql
SELECT * FROM system.zookeeper WHERE path='/clickhouse/cluster_1/tables/01/';

INSERT INTO table_repl SELECT * FROM numbers(1000,2000);

SELECT partition, sum(rows) AS rows, count() FROM system.parts WHERE table='table_repl' AND active GROUP BY partition;
```

Now let’s remove metadata in zookeeper using `ZkCli.sh` at ZooKeeper host:

```bash
deleteall  /clickhouse/cluster_1/tables/01/table_repl
```

And try to resync clickhouse replica state with zookeeper:

```sql
SYSTEM RESTART REPLICA table_repl;
```

If we try to insert some data in the table, error happens:

```sql
INSERT INTO table_repl SELECT number AS number FROM numbers(1000,2000) WHERE number % 2 = 0;
```

And now we have an exception that we lost all metadata in zookeeper. It is time to recover!

## Current Solution <a id="Recoveringfromcompletemetadatalossinzookeeper-CurrentSolution"></a>

1. Detach replicated table.

   ```text
   DETACH TABLE table_repl;
   ```

2. Save the table’s attach script and change engine of replicated table to non-replicated \*mergetree analogue. Table definition is located in the ‘metadata’ folder, ‘`/var/lib/clickhouse/metadata/default/table_repl.sql`’ in our example. Please make a backup copy and modify the file as follows:

   ```text
   ATTACH TABLE table_repl
   (
      `number` UInt32
   )
   ENGINE = ReplicatedMergeTree('/clickhouse/{cluster}/tables/{shard}/table_repl', '{replica}')
   PARTITION BY intDiv(number, 1000)
   ORDER BY number
   SETTINGS index_granularity = 8192
   ```

   Needs to be replaced with this:

   ```text
   ATTACH TABLE table_repl
   (
      `number` UInt32
   )
   ENGINE = MergeTree()
   PARTITION BY intDiv(number, 1000)
   ORDER BY number
   SETTINGS index_granularity = 8192
   ```

3. Attach non-replicated table.

   ```text
   ATTACH TABLE table_repl;
   ```

4. Rename non-replicated table.

   ```text
   RENAME TABLE table_repl TO table_repl_old;
   ```

5. Create a new replicated table. Take the saved attach script and replace ATTACH with CREATE, and run it.

   ```text
   CREATE TABLE table_repl
   (
      `number` UInt32
   )
   ENGINE = ReplicatedMergeTree('/clickhouse/{cluster}/tables/{shard}/table_repl', '{replica}')
   PARTITION BY intDiv(number, 1000)
   ORDER BY number
   SETTINGS index_granularity = 8192
   ```

6. Attach parts from old table to new.

   ```text
   ALTER TABLE table_repl ATTACH PARTITION 1 FROM table_repl_old;

   ALTER TABLE table_repl ATTACH PARTITION 2 FROM table_repl_old;
   ```

If the table has many partitions, it may require some shell script to make it easier.

### Automated approach

For a large number of tables, you can use script  [https://github.com/Altinity/clickhouse-zookeeper-recovery](https://github.com/Altinity/clickhouse-zookeeper-recovery) which partially automates the above approach.





