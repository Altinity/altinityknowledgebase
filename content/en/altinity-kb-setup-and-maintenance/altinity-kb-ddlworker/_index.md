---
title: "DDLWorker and DDL queue problems"
linkTitle: "DDLWorker and DDL queue problems"
description: > 
    Finding and troubleshooting problems in the `distributed_ddl_queue`
keywords: 
   - clickhouse ddl
   - clickhouse replication queue    
---
DDLWorker is a subprocess (thread) of `clickhouse-server` that executes `ON CLUSTER` tasks at the node.

When you execute a DDL query with `ON CLUSTER mycluster` section, the query executor at the current node reads the cluster `mycluster` definition (remote_servers / system.clusters) and places tasks into Zookeeper znode `task_queue/ddl/...` for members of the cluster `mycluster`.

DDLWorker at all ClickHouse® nodes constantly check this `task_queue` for their tasks, executes them locally, and reports about the results back into `task_queue`.

The common issue is the different hostnames/IPAddresses in the cluster definition and locally.

So if the initiator node puts tasks for a host named Host1. But the Host1 thinks about own name as localhost or **xdgt634678d** (internal docker hostname) and never sees tasks for the Host1 because is looking tasks for **xdgt634678d.** The same with internal VS external IP addresses.

## DDLWorker thread crashed

That causes ClickHouse to stop executing `ON CLUSTER` tasks.

Check that DDLWorker is alive:

```bash
ps -eL|grep DDL
18829 18876 ?        00:00:00 DDLWorkerClnr
18829 18879 ?        00:00:00 DDLWorker

ps -ef|grep 18829|grep -v grep
clickho+ 18829 18828  1 Feb09 ?        00:55:00 /usr/bin/clickhouse-server --con...
```

As you can see there are two threads: `DDLWorker` and `DDLWorkerClnr`.

The second thread – `DDLWorkerCleaner` cleans old tasks from `task_queue`. You can configure how many recent tasks to store:

```markup
config.xml
<yandex>
    <distributed_ddl>
        <path>/clickhouse/task_queue/ddl</path>
        <pool_size>1</pool_size>
        <max_tasks_in_queue>1000</max_tasks_in_queue>
        <task_max_lifetime>604800</task_max_lifetime>
        <cleanup_delay_period>60</cleanup_delay_period>
    </distributed_ddl>
</yandex>
```

Default values:

**cleanup_delay_period** = 60 seconds – Sets how often to start cleanup to remove outdated data.

**task_max_lifetime** = 7 \* 24 \* 60 \* 60 (in seconds = week) – Delete task if its age is greater than that.

**max_tasks_in_queue** = 1000 – How many tasks could be in the queue.

**pool_size** = 1 - 	How many ON CLUSTER queries can be run simultaneously.

## Too intensive stream of ON CLUSTER command

Generally, it's a bad design, but you can increase pool_size setting 

## Stuck DDL tasks in the distributed_ddl_queue

Sometimes [DDL tasks](/altinity-kb-setup-and-maintenance/altinity-kb-ddlworker/) (the ones that use ON CLUSTER) can get stuck in the `distributed_ddl_queue` because the replicas can overload if multiple DDLs (thousands of CREATE/DROP/ALTER) are executed at the same time. This is very normal in heavy ETL jobs.This can be detected by checking the `distributed_ddl_queue` table and see if there are tasks that are not moving or are stuck for a long time.

If these DDLs are completed in some replicas but failed in others, the simplest way to solve this is to execute the failed command in the missed replicas without ON CLUSTER. If most of the DDLs failed, then check the number of unfinished records in `distributed_ddl_queue` on the other nodes, because most probably it will be as high as thousands.

First, backup the `distributed_ddl_queue` into a table so you will have a snapshot of the table with the states of the tasks. You can do this with the following command:

```sql
CREATE TABLE default.system_distributed_ddl_queue AS SELECT * FROM system.distributed_ddl_queue;
```

After this, we need to check from the backup table which tasks are not finished and execute them manually in the missed replicas, and review the pipeline which do `ON CLUSTER` command and does not abuse them. There is a new `CREATE TEMPORARY TABLE` command that can be used to avoid the `ON CLUSTER` command in some cases, where you need an intermediate table to do some operations and after that you can `INSERT INTO` the final table or do `ALTER TABLE final ATTACH PARTITION FROM TABLE temp` and this temp table will be dropped automatically after the session is closed.


