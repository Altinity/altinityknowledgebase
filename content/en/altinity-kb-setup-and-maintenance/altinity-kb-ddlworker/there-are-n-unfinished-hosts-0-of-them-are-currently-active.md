---
title: "There are N unfinished hosts (0 of them are currently active)."
linkTitle: "Unfinished hosts"
weight: 100
description: >
    Diagnosing `Distributed DDL` queries stuck with unfinished, inactive hosts.
---

When a `Distributed DDL` query is "stuck" on one or more nodes, the initiator
typically reports `There are N unfinished hosts (0 of them are currently
active).` Several distinct root causes produce the same message, so the
investigation usually means narrowing down to one of them.

Background and config knobs live in
[DDLWorker and DDL queue problems](/altinity-kb-setup-and-maintenance/altinity-kb-ddlworker/).

The fastest first look is the system table — it joins ZooKeeper and local
executor state in one query:

```sql
SELECT entry, host, port, status, exception_code, exception_text,
       query_create_time, query_finish_time, query
FROM system.distributed_ddl_queue
WHERE status != 'Finished'
ORDER BY entry DESC, host;
```

If that doesn't make it obvious, work through the possible reasons below.

## Possible reasons

### ClickHouse® node can't recognize itself

```sql
SELECT * FROM system.clusters; -- check is_local column, it should be 1 for itself
```

```bash
getent hosts clickhouse.local.net # or whichever name should resolve to this host
hostname --fqdn

cat /etc/hosts
cat /etc/hostname
```

On Debian/Ubuntu images the FQDN often maps to `127.0.1.1`, which doesn't
match any network interface and ClickHouse® fails to detect this address as
local — see
[ClickHouse#23504](https://github.com/ClickHouse/ClickHouse/issues/23504).

### Previous task is being executed and taking some time

Usually a heavy operation — large merge, mutation, or `ALTER COLUMN`:

```sql
SHOW PROCESSLIST;
SELECT * FROM system.merges;
SELECT * FROM system.mutations;
```

In that case, wait for the previous task to finish.

### Previous task is stuck because of an error

Identify the exact task and figure out why. Useful queries:

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

-- Latest successfully executed tasks from query_log.
SELECT query FROM system.query_log WHERE query LIKE '%ddl_entry%' AND type = 2 ORDER BY event_time DESC LIMIT 5;

-- Compare highest processed DDL entry across every replica.
SELECT FQDN(), *
FROM clusterAllReplicas('cluster', system.metrics)
WHERE metric LIKE '%MaxDDLEntryID%';

┌─FQDN()────────────────────┬─metric────────┬─value─┬─description───────────────────────────┐
│ chi-ab-r1.svc.cluster.local │ MaxDDLEntryID │  1468 │ Max processed DDL entry of DDLWorker. │
│ chi-ab-r2.svc.cluster.local │ MaxDDLEntryID │  1432 │ Max processed DDL entry of DDLWorker. │
│ chi-ab-r3.svc.cluster.local │ MaxDDLEntryID │  1468 │ Max processed DDL entry of DDLWorker. │
└─────────────────────────────┴───────────────┴───────┴───────────────────────────────────────┘

-- Information about task execution from logs.
grep -C 40 "ddl_entry" /var/log/clickhouse-server/clickhouse-server*.log
```

A replica whose `MaxDDLEntryID` lags the others is the one to investigate.

### Issues that can prevent task execution

#### Obsolete replicas

Old replicas left in ZooKeeper that never come back online block tasks that
expect them:

```sql
SELECT database, table, zookeeper_path, replica_path
FROM system.replicas
WHERE total_replicas != active_replicas;

SELECT * FROM system.zookeeper
WHERE path = '/clickhouse/cluster/tables/01/database/table/replicas';

SYSTEM DROP REPLICA 'replica_name';
```

See [SYSTEM DROP REPLICA](https://clickhouse.com/docs/en/sql-reference/statements/system/#query_language-system-drop-replica).

#### Tasks manually removed from DDL queue

Task was removed from the DDL queue but is still referenced by a
`Replicated*MergeTree` table's replication queue:

```bash
grep -C 40 "ddl_entry" /var/log/clickhouse-server/clickhouse-server*.log

/var/log/clickhouse-server/clickhouse-server.log:2021.05.04 12:41:28.956888 [ 599 ] {} <Debug> DDLWorker: Processing task query-0000211211 (ALTER TABLE db.table_local ON CLUSTER `all-replicated` DELETE WHERE id = 1)
/var/log/clickhouse-server/clickhouse-server.log:2021.05.04 12:41:29.053555 [ 599 ] {} <Error> DDLWorker: ZooKeeper error: Code: 999, e.displayText() = Coordination::Exception: No node, Stack trace (when copying this message, always include the lines below):
/var/log/clickhouse-server/clickhouse-server.log-0. Coordination::Exception::Exception(...) @ ... in /usr/bin/clickhouse
/var/log/clickhouse-server/clickhouse-server.log-1. Coordination::Exception::Exception(Coordination::Error) @ ... in /usr/bin/clickhouse
/var/log/clickhouse-server/clickhouse-server.log:2. DB::DDLWorker::createStatusDirs(...) @ ... in /usr/bin/clickhouse
/var/log/clickhouse-server/clickhouse-server.log:3. DB::DDLWorker::processTask(DB::DDLTask&) @ ... in /usr/bin/clickhouse
/var/log/clickhouse-server/clickhouse-server.log- ...
/var/log/clickhouse-server/clickhouse-server.log- (version 21.1.8.30 (official build))
/var/log/clickhouse-server/clickhouse-server.log:2021.05.04 12:41:29.053951 [ 599 ] {} <Debug> DDLWorker: Processing task query-0000211211 (ALTER TABLE db.table_local ON CLUSTER `all-replicated` DELETE WHERE id = 1)
```

Context:
* Constant pressure of cheap `ON CLUSTER DELETE` queries.
* One replica was down for a long time (multiple days).
* Because of pressure on the DDL queue, old records were purged via `task_max_lifetime`.
* When the lagging replica came back, it failed to execute the old queries from the DDL queue — they no longer existed.

Solution:
* Reload/restore that replica from scratch.

#### DDL path was changed in ZooKeeper without restarting ClickHouse

Changing the DDL queue path in ZooKeeper without restarting ClickHouse leaves
the server confused — it keeps polling the old path. Avoid path changes if at
all possible; if it must be done, restart ClickHouse before submitting any
further `ON CLUSTER` commands.

```sql
-- Path before change:
SELECT *
FROM system.zookeeper
WHERE path = '/clickhouse/clickhouse101/task_queue';

┌─name─┬─value─┬─path─────────────────────────────────┐
│ ddl  │       │ /clickhouse/clickhouse101/task_queue │
└──────┴───────┴──────────────────────────────────────┘

-- Path after change
SELECT *
FROM system.zookeeper
WHERE path = '/clickhouse/clickhouse101/task_queue';

┌─name─┬─value─┬─path─────────────────────────────────┐
│ ddl2 │       │ /clickhouse/clickhouse101/task_queue │
└──────┴───────┴──────────────────────────────────────┘
```

## Still stuck?

If the task can't be made to progress and is blocking everything else:

- Rerun the original DDL statement on each missing replica directly (without
  `ON CLUSTER`) once the queue is unblocked.
- For obsolete replicas, `SYSTEM DROP REPLICA 'replica_name'` removes their
  expectations from ZooKeeper.
- If the queue itself is corrupt, capture the relevant
  `system.distributed_ddl_queue` rows and ZooKeeper paths before any
  remediation so you can reconstruct what happened.
