---
title: "clickhouse-copier 20.3 and earlier"
linkTitle: "clickhouse-copier 20.3 and earlier"
description: >
    clickhouse-copier 20.3 and earlier
---
Clickhouse-copier was created to move data between clusters.
It runs simple INSERT…SELECT queries and can copy data between tables with different engine parameters and between clusters with different number of shards.
In the task configuration file you need to describe the layout of the source and the target cluster, and list the tables that you need to copy. You can copy whole tables or specific partitions.
Clickhouse-copier uses temporary distributed tables to select from the source cluster and insert into the target cluster.

## The process is as follows

1. Process the configuration files.
2. Discover the list of partitions if not provided in the config.
3. Copy partitions one by one.
   1. Drop the partition from the target table if it’s not empty
   2. Copy data from source shards one by one.
      1. Check if there is data for the partition on a source shard.
      2. Check the status of the task in ZooKeeper.
      3. Create target tables on all shards of the target cluster.
      4. Insert the partition of data into the target table.
   3. Mark the partition as completed in ZooKeeper.

If there are several workers running simultaneously, they will assign themselves to different source shards.
If a worker was interrupted, another worker can be started to continue the task. The next worker will drop incomplete partitions and resume the copying.

## Configuring the engine of the target table

Clickhouse-copier uses the engine from the task configuration file for these purposes:

* to create target tables if they don’t exist.
* PARTITION BY: to SELECT a partition of data from the source table, to DROP existing partitions from target tables.

Clickhouse-copier does not support the old MergeTree format.
However, you can create the target tables manually and specify the engine in the task configuration file in the new format so that clickhouse-copier can parse it for its SELECT queries.

## How to monitor the status of running tasks

Clickhouse-copier uses ZooKeeper to keep track of the progress and to communicate between workers.
Here is a list of queries that you can use to see what’s happening.

```sql
--task-path /clickhouse/copier/task1

-- The task config
select * from system.zookeeper
where path='<task-path>'
name                        | ctime               | mtime           
----------------------------+---------------------+--------------------
description                 | 2019-10-18 15:40:00 | 2020-09-11 16:01:14
task_active_workers_version | 2019-10-18 16:00:09 | 2020-09-11 16:07:08
tables                      | 2019-10-18 16:00:25 | 2019-10-18 16:00:25
task_active_workers         | 2019-10-18 16:00:09 | 2019-10-18 16:00:09


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
201909 | 2019-10-18 18:24:18


-- The status of a partition
select * from system.zookeeper
where path='<task-path>/tables/<table>/<partition>'
name                     | ctime           
-------------------------+--------------------
shards                   | 2019-10-18 18:24:18
partition_active_workers | 2019-10-18 18:24:18


-- The status of source shards
select * from system.zookeeper
where path='<task-path>/tables/<table>/<partition>/shards'
name | ctime               | mtime           
-----+---------------------+--------------------
1    | 2019-10-18 22:37:48 | 2019-10-18 22:49:29
```
