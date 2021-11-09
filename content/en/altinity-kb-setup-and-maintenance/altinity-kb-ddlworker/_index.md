---
title: "DDLWorker"
linkTitle: "DDLWorker"
description: >
    DDLWorker
---
DDLWorker is a subprocess (thread) of clickhouse-server that executes `ON CLUSTER` tasks at the node.

When you execute a DDL query with `ON CLUSTER mycluster` section the query executor at the current node reads the cluster `mycluster` definition (remote_servers / system.clusters) and places tasks into Zookeeper znode `task_queue/ddl/...` for members of the cluster `mycluster`.

DDLWorker at all ClickHouse nodes constantly check this `task_queue` for their tasks and executes them locally and reports about a result back into `task_queue`.

The common issue is the different hostnames/IPAddresses in the cluster definition and locally.

So a node initiator puts tasks for a host named Host1. But the Host1 thinks about own name as localhost or **xdgt634678d** (internal docker hostname) and never sees tasks for the Host1 because is looking tasks for **xdgt634678d.** The same with internal VS external IP addresses.

Another issue that sometimes DDLWorker thread can crash then ClickHouse node stops to execute `ON CLUSTER` tasks.

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
