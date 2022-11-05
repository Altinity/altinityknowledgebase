---
title: "There are N unfinished hosts (0 of them are currently active)."
linkTitle: "There are N unfinished hosts (0 of them are currently active)."
description: >
    "There are N unfinished hosts (0 of them are currently active)."
---
Sometimes your Distributed DDL queries are being stuck, and not executing on all or subset of nodes, there are a lot of possible reasons for that kind of behavior, so it would take some time and effort to investigate.

## Possible reasons

### Clickhouse node can't recognize itself

```sql
SELECT * FROM system.clusters; -- check is_local column, it should have 1 for itself
```

```bash
getent hosts clickhouse.local.net # or other name which should be local
hostname --fqdn

cat /etc/hosts
cat /etc/hostname
```

### Debian / Ubuntu

There is an issue in Debian based images, when hostname being mapped to 127.0.1.1 address which doesn't literally match network interface and clickhouse fails to detect this address as local.

[https://github.com/ClickHouse/ClickHouse/issues/23504](https://github.com/ClickHouse/ClickHouse/issues/23504)

#### Previous task is being executed and taking some time

It's usually some heavy operations like merges, mutations, alter columns, so it make sense to check those tables:

```sql
SHOW PROCESSLIST;
SELECT * FROM system.merges;
SELECT * FROM system.mutations;
```

In that case, you can just wait completion of previous task.

### Previous task is stuck because of some error

In that case, the first step is to understand which exact task is stuck and why. There are some queries which can help with that.

```sql
-- list of all distributed ddl queries, path can be different in your installation
SELECT * FROM system.zookeeper WHERE path = '/clickhouse/task_queue/ddl/';

-- information about specific task.
SELECT * FROM system.zookeeper WHERE path = '/clickhouse/task_queue/ddl/query-0000001000/';
SELECT * FROM system.zookeeper WHERE path = '/clickhouse/task_queue/ddl/' AND name = 'query-0000001000';
-- 22.3
SELECT * FROM system.zookeeper WHERE path like '/clickhouse/task_queue/ddl/query-0000001000/%' 
ORDER BY ctime, path SETTINGS allow_unrestricted_reads_from_keeper='true'
-- 22.6
SELECT path, name, value, ctime, mtime 
FROM system.zookeeper WHERE path like '/clickhouse/task_queue/ddl/query-0000001000/%' 
ORDER BY ctime, path SETTINGS allow_unrestricted_reads_from_keeper='true'

-- How many nodes executed this task
SELECT name, numChildren as finished_nodes FROM system.zookeeper
WHERE path = '/clickhouse/task_queue/ddl/query-0000001000/' AND name = 'finished';

┌─name─────┬─finished_nodes─┐
│ finished │              0 │
└──────────┴────────────────┘

-- The nodes that are running the task
SELECT name, value, ctime, mtime FROM system.zookeeper 
WHERE path = '/clickhouse/task_queue/ddl/query-0000001000/active/';

-- What was the result for the finished nodes 
SELECT name, value, ctime, mtime FROM system.zookeeper 
WHERE path = '/clickhouse/task_queue/ddl/query-0000001000/finished/';

-- Latest successfull executed tasks from query_log.
SELECT query FROM system.query_log WHERE query LIKE '%ddl_entry%' AND type = 2 ORDER BY event_time DESC LIMIT 5;

SELECT
    FQDN(),
    *
FROM clusterAllReplicas('cluster', system.metrics)
WHERE metric LIKE '%MaxDDLEntryID%'

┌─FQDN()───────────────────┬─metric────────┬─value─┬─description───────────────────────────┐
│ chi-ab.svc.cluster.local │ MaxDDLEntryID │  1468 │ Max processed DDL entry of DDLWorker. │
└──────────────────────────┴───────────────┴───────┴───────────────────────────────────────┘
┌─FQDN()───────────────────┬─metric────────┬─value─┬─description───────────────────────────┐
│ chi-ab.svc.cluster.local │ MaxDDLEntryID │  1468 │ Max processed DDL entry of DDLWorker. │
└──────────────────────────┴───────────────┴───────┴───────────────────────────────────────┘
┌─FQDN()───────────────────┬─metric────────┬─value─┬─description───────────────────────────┐
│ chi-ab.svc.cluster.local │ MaxDDLEntryID │  1468 │ Max processed DDL entry of DDLWorker. │
└──────────────────────────┴───────────────┴───────┴───────────────────────────────────────┘


-- Information about task execution from logs.
grep -C 40 "ddl_entry" /var/log/clickhouse-server/clickhouse-server*.log
```


### Issues that can prevent task execution

#### Obsolete Replicas 

Obsolete replicas left in zookeeper.

```sql
SELECT database, table, zookeeper_path, replica_path zookeeper FROM system.replicas WHERE total_replicas != active_replicas;

SELECT * FROM system.zookeeper WHERE path = '/clickhouse/cluster/tables/01/database/table/replicas';

SYSTEM DROP REPLICA 'replica_name';

SYSTEM STOP REPLICATION QUEUES;
SYSTEM START REPLICATION QUEUES;
```

[https://clickhouse.tech/docs/en/sql-reference/statements/system/\#query_language-system-drop-replica](https://clickhouse.tech/docs/en/sql-reference/statements/system/\#query_language-system-drop-replica)

#### Tasks manually removed from DDL queue 

Task were removed from DDL queue, but left in Replicated\*MergeTree table queue.

```bash
grep -C 40 "ddl_entry" /var/log/clickhouse-server/clickhouse-server*.log

/var/log/clickhouse-server/clickhouse-server.log:2021.05.04 12:41:28.956888 [ 599 ] {} <Debug> DDLWorker: Processing task query-0000211211 (ALTER TABLE db.table_local ON CLUSTER `all-replicated` DELETE WHERE id = 1)
/var/log/clickhouse-server/clickhouse-server.log:2021.05.04 12:41:29.053555 [ 599 ] {} <Error> DDLWorker: ZooKeeper error: Code: 999, e.displayText() = Coordination::Exception: No node, Stack trace (when copying this message, always include the lines below):
/var/log/clickhouse-server/clickhouse-server.log-
/var/log/clickhouse-server/clickhouse-server.log-0. Coordination::Exception::Exception(std::__1::basic_string<char, std::__1::char_traits<char>, std::__1::allocator<char> > const&, Coordination::Error, int) @ 0xfb2f6b3 in /usr/bin/clickhouse
/var/log/clickhouse-server/clickhouse-server.log-1. Coordination::Exception::Exception(Coordination::Error) @ 0xfb2fb56 in /usr/bin/clickhouse
/var/log/clickhouse-server/clickhouse-server.log:2. DB::DDLWorker::createStatusDirs(std::__1::basic_string<char, std::__1::char_traits<char>, std::__1::allocator<char> > const&, std::__1::shared_ptr<zkutil::ZooKeeper> const&) @ 0xeb3127a in /usr/bin/clickhouse
/var/log/clickhouse-server/clickhouse-server.log:3. DB::DDLWorker::processTask(DB::DDLTask&) @ 0xeb36c96 in /usr/bin/clickhouse
/var/log/clickhouse-server/clickhouse-server.log:4. DB::DDLWorker::enqueueTask(std::__1::unique_ptr<DB::DDLTask, std::__1::default_delete<DB::DDLTask> >) @ 0xeb35f22 in /usr/bin/clickhouse
/var/log/clickhouse-server/clickhouse-server.log-5. ? @ 0xeb47aed in /usr/bin/clickhouse
/var/log/clickhouse-server/clickhouse-server.log-6. ThreadPoolImpl<ThreadFromGlobalPool>::worker(std::__1::__list_iterator<ThreadFromGlobalPool, void*>) @ 0x8633bcd in /usr/bin/clickhouse
/var/log/clickhouse-server/clickhouse-server.log-7. ThreadFromGlobalPool::ThreadFromGlobalPool<void ThreadPoolImpl<ThreadFromGlobalPool>::scheduleImpl<void>(std::__1::function<void ()>, int, std::__1::optional<unsigned long>)::'lambda1'()>(void&&, void ThreadPoolImpl<ThreadFromGlobalPool>::scheduleImpl<void>(std::__1::function<void ()>, int, std::__1::optional<unsigned long>)::'lambda1'()&&...)::'lambda'()::operator()() @ 0x863612f in /usr/bin/clickhouse
/var/log/clickhouse-server/clickhouse-server.log-8. ThreadPoolImpl<std::__1::thread>::worker(std::__1::__list_iterator<std::__1::thread, void*>) @ 0x8630ffd in /usr/bin/clickhouse
/var/log/clickhouse-server/clickhouse-server.log-9. ? @ 0x8634bb3 in /usr/bin/clickhouse
/var/log/clickhouse-server/clickhouse-server.log-10. start_thread @ 0x9609 in /usr/lib/x86_64-linux-gnu/libpthread-2.31.so
/var/log/clickhouse-server/clickhouse-server.log-11. __clone @ 0x122293 in /usr/lib/x86_64-linux-gnu/libc-2.31.so
/var/log/clickhouse-server/clickhouse-server.log- (version 21.1.8.30 (official build))
/var/log/clickhouse-server/clickhouse-server.log:2021.05.04 12:41:29.053951 [ 599 ] {} <Debug> DDLWorker: Processing task query-0000211211 (ALTER TABLE db.table_local ON CLUSTER `all-replicated` DELETE WHERE id = 1)
```

Context of this problem is:
* Constant pressure of cheap ON CLUSTER DELETE queries.
* One replica was down for a long amount of time (multiple days).
* Because of pressure on the DDL queue, it purged old records due to the `task_max_lifetime` setting.
* When a lagging replica comes up, it's fail's execute old queries from DDL queue, because at this point they were purged from it.

Solution:
* Reload/Restore this replica from scratch.

#### DDL path was changed in Zookeeper without restarting ClickHouse

Changing the DDL queue path in Zookeeper without restarting ClickHouse will make ClickHouse confused. If you need to do this ensure that you restart ClickHouse before submitting additional distributed DDL commands. Here's an example. 

```sql
-- Path before change:
SELECT *
FROM system.zookeeper
WHERE path = '/clickhouse/clickhouse101/task_queue'

┌─name─┬─value─┬─path─────────────────────────────────┐
│ ddl  │       │ /clickhouse/clickhouse101/task_queue │
└──────┴───────┴──────────────────────────────────────┘

-- Path after change
SELECT *
FROM system.zookeeper
WHERE path = '/clickhouse/clickhouse101/task_queue'

┌─name─┬─value─┬─path─────────────────────────────────┐
│ ddl2 │       │ /clickhouse/clickhouse101/task_queue │
└──────┴───────┴──────────────────────────────────────┘
```

The reason is that ClickHouse will not "see" this change and will continue to look for tasks in the old path. Altering paths in Zookeeper should be avoided if at all possible. If necessary it must be done *very carefuly*. 
