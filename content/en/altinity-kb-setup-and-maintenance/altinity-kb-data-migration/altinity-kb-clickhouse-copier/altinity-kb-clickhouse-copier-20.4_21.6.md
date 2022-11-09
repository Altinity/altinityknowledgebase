---
title: "clickhouse-copier 20.4 - 21.6"
linkTitle: "clickhouse-copier 20.4 - 21.6"
description: >
    clickhouse-copier 20.4 - 21.6
---
Clickhouse-copier was created to move data between clusters.
It runs simple `INSERT…SELECT` queries and can copy data between tables with different engine parameters and between clusters with different number of shards.
In the task configuration file you need to describe the layout of the source and the target cluster, and list the tables that you need to copy. You can copy whole tables or specific partitions.
Clickhouse-copier uses temporary distributed tables to select from the source cluster and insert into the target cluster.

The behavior of clickhouse-copier was changed in 20.4:

* Now clickhouse-copier inserts data into intermediate tables, and after the insert finishes successfully clickhouse-copier attaches the completed partition into the target table. This allows for incremental data copying, because the data in the target table is intact during the process. **Important note:** ATTACH PARTITION respects the `max_partition_size_to_drop` limit. Make sure the `max_partition_size_to_drop` limit is big enough (or set to zero) in the destination cluster. If clickhouse-copier is unable to attach a partition because of the limit, it will proceed to the next partition, and it will drop the intermediate table when the task is finished (if the intermediate table is less than the `max_table_size_to_drop` limit). **Another important note:** ATTACH PARTITION is replicated. The attached partition will need to be downloaded by the other replicas. This can create significant network traffic between ClickHouse nodes. If an attach takes a long time, clickhouse-copier will log a timeout and will proceed to the next step.
* Now clickhouse-copier splits the source data into chunks and copies them one by one. This is useful for big source tables, when inserting one partition of data can take hours. If there is an error during the insert clickhouse-copier has to drop the whole partition and start again. The `number_of_splits` parameter lets you split your data into chunks so that in case of an exception clickhouse-copier has to re-insert only one chunk of the data.
* Now clickhouse-copier runs `OPTIMIZE target_table PARTITION ... DEDUPLICATE` for non-Replicated MergeTree tables. **Important note:** This is a very strange feature that can do more harm than good. We recommend to disable it by configuring the engine of the target table as Replicated in the task configuration file, and create the target tables manually if they are not supposed to be replicated. Intermediate tables are always created as plain MergeTree.

## The process is as follows

1. Process the configuration files.
2. Discover the list of partitions if not provided in the config.
3. Copy partitions one by one  ** The metadata in ZooKeeper suggests the order described here.**
   1. Copy chunks of data one by one.
      1. Copy data from source shards one by one.
         1. Create intermediate tables on all shards of the target cluster.
         2. Check the status of the chunk in ZooKeeper.
         3. Drop the partition from the intermediate table if the previous attempt was interrupted.
         4. Insert the chunk of data into the intermediate tables.
         5. Mark the shard as completed in ZooKeeper
   2. Attach the chunks of the completed partition into the target table one by one
      1. Attach a chunk into the target table.
      2. **non-Replicated:** Run OPTIMIZE target_table DEDUPLICATE for the partition on the target table.
4. Drop intermediate tables (may not succeed if the tables are bigger than `max_table_size_to_drop`).

If there are several workers running simultaneously, they will assign themselves to different source shards.
If a worker was interrupted, another worker can be started to continue the task. The next worker will drop incomplete partitions and resume the copying.

## Configuring the engine of the target table

Clickhouse-copier uses the engine from the task configuration file for these purposes:

* to create target and intermediate tables if they don’t exist.
* PARTITION BY: to SELECT a partition of data from the source table, to ATTACH partitions into target tables, to DROP incomplete partitions from intermediate tables, to OPTIMIZE partitions after they are attached to the target.
* ORDER BY: to SELECT a chunk of data from the source table.

Here is an example of SELECT that clickhouse-copier runs to get the sixth of ten chunks of data:

```sql
WHERE (<the PARTITION BY clause> = (<a value of the PARTITION BY expression> AS partition_key))
  AND (cityHash64(<the ORDER BY clause>) % 10 = 6 )
```

Clickhouse-copier does not support the old MergeTree format.
However, you can create the intermediate tables manually with the same engine as the target tables (otherwise ATTACH will not work), and specify the engine in the task configuration file in the new format so that clickhouse-copier can parse it for SELECT, ATTACH PARTITION and DROP PARTITION queries.

**Important note**: always configure engine as Replicated to disable OPTIMIZE … DEDUPLICATE (unless you know why you need clickhouse-copier to run OPTIMIZE … DEDUPLICATE).

## How to configure the number of chunks

The default value for `number_of_splits` is 10.
You can change this parameter in the `table` section of the task configuration file. We recommend setting it to 1 for smaller tables.

```xml
<cluster_push>target_cluster</cluster_push>
<database_push>target_database</database_push>
<table_push>target_table</table_push>
<number_of_splits>1</number_of_splits>
<engine>Engine=Replicated...<engine>
```

## How to monitor the status of running tasks

Clickhouse-copier uses ZooKeeper to keep track of the progress and to communicate between workers.
Here is a list of queries that you can use to see what’s happening.

```sql
--task-path=/clickhouse/copier/task1

-- The task config
select * from system.zookeeper
where path='<task-path>'
name                        | ctime               | mtime           
----------------------------+---------------------+--------------------
description                 | 2021-03-22 13:15:48 | 2021-03-22 13:25:28
status                      | 2021-03-22 13:15:48 | 2021-03-22 13:25:28
task_active_workers_version | 2021-03-22 13:15:48 | 2021-03-22 20:32:09
tables                      | 2021-03-22 13:16:47 | 2021-03-22 13:16:47
task_active_workers         | 2021-03-22 13:15:48 | 2021-03-22 13:15:48


-- Status
select * from system.zookeeper
where path='<task-path>/status'


-- Running workers
select * from system.zookeeper
where path='<task-path>/task_active_workers'


-- The list of processed tables
select * from system.zookeeper
where path='<task-path>/tables'


-- The list of processed partitions
select * from system.zookeeper
where path='<task-path>/tables/<table>'
name   | ctime           
-------+--------------------
202103 | 2021-03-22 13:16:47
202102 | 2021-03-22 13:18:31
202101 | 2021-03-22 13:27:36
202012 | 2021-03-22 14:05:08


-- The status of a partition
select * from system.zookeeper
where path='<task-path>/tables/<table>/<partition>'
name           | ctime           
---------------+--------------------
piece_0        | 2021-03-22 13:18:31
attach_is_done | 2021-03-22 14:05:05


-- The status of a piece
select * from system.zookeeper
where path='<task-path>/tables/<table>/<partition>/piece_N'
name                           | ctime           
-------------------------------+--------------------
shards                         | 2021-03-22 13:18:31
is_dirty                       | 2021-03-22 13:26:51
partition_piece_active_workers | 2021-03-22 13:26:54
clean_start                    | 2021-03-22 13:26:54


-- The status of source shards
select * from system.zookeeper
where path='<task-path>/tables/<table>/<partition>/piece_N/shards'
name | ctime               | mtime           
-----+---------------------+--------------------
1    | 2021-03-22 13:26:54 | 2021-03-22 14:05:05
```
