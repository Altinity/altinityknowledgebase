---
title: "DDLWorker and DDL queue problems"
linkTitle: "DDLWorker and DDL queue problems"
weight: 100
description: >
    Finding and troubleshooting problems in the `distributed_ddl_queue`
keywords:
  - clickhouse ddl
  - clickhouse replication queue
  - distributed_ddl_queue
  - DDLWorker
---

`DDLWorker` is a thread inside `clickhouse-server` that executes `ON CLUSTER`
tasks on the local node.

When a DDL is run with `ON CLUSTER mycluster`, the initiator node reads the
`mycluster` definition from `system.clusters` and writes a single task znode
`/clickhouse/task_queue/ddl/query-NNNNNNNNNN` in ZooKeeper. Its value contains
the query and the list of target hosts. Each target's `DDLWorker` polls
`/clickhouse/task_queue/ddl/`, claims tasks addressed to its own host name,
registers itself under the task's `active/` child while executing, then
writes its result under the task's `finished/` child when done.

The most frequent failure mode is a hostname or IP mismatch between the
cluster definition and what each node thinks its own name is — a host never
picks up tasks addressed to it under a name it doesn't recognize. See
[Hostname / IP mismatch](#hostname--ip-mismatch) below.

For deep-dive symptoms see
[There are N unfinished hosts](/altinity-kb-setup-and-maintenance/altinity-kb-ddlworker/there-are-n-unfinished-hosts-0-of-them-are-currently-active/).
For the underlying ZooKeeper layer see
[ZooKeeper](/altinity-kb-setup-and-maintenance/altinity-kb-zookeeper/).

## Inspecting the queue: `system.distributed_ddl_queue`

Start here before reaching for raw `system.zookeeper` queries — the system
table joins state from ZooKeeper and the local executor and answers the typical
"who is stuck and why" question:

```sql
SELECT entry, host, port, status, exception_code, exception_text,
       query_create_time, query_finish_time, query
FROM system.distributed_ddl_queue
WHERE status != 'Finished'
ORDER BY entry DESC, host
LIMIT 50;
```

For per-task znode digs (children of `finished/`, `active/`, raw task body) see
the SQL recipes in
[There are N unfinished hosts](/altinity-kb-setup-and-maintenance/altinity-kb-ddlworker/there-are-n-unfinished-hosts-0-of-them-are-currently-active/).

## Hostname / IP mismatch

The initiator addresses tasks to a host using the name it has in
`system.clusters`. If the target host's `system.clusters.is_local = 0` for its
own row, `DDLWorker` won't claim those tasks — it's waiting for tasks addressed
to a different name (often `localhost`, an internal Docker hostname like
`xdgt634678d`, or a different IP family).

Checklist on the host that isn't picking up tasks:

```sql
-- Should return is_local = 1 for the row matching this node.
SELECT cluster, host_name, host_address, port, is_local
FROM system.clusters
WHERE cluster = 'mycluster';
```

```bash
hostname --fqdn
cat /etc/hostname
cat /etc/hosts
getent hosts $(hostname --fqdn)
```

On Debian/Ubuntu the FQDN often resolves to `127.0.1.1`, which doesn't match
any real interface and trips this exact failure — see
[ClickHouse#23504](https://github.com/ClickHouse/ClickHouse/issues/23504).

## DDLWorker thread crashed

If the thread dies, `ON CLUSTER` tasks stop executing on this node.

Check that both threads are alive:

```bash
ps -eL|grep DDL
18829 18876 ?        00:00:00 DDLWorkerClnr
18829 18879 ?        00:00:00 DDLWorker

ps -ef|grep 18829|grep -v grep
clickho+ 18829 18828  1 Feb09 ?        00:55:00 /usr/bin/clickhouse-server --con...
```

Two threads should be present: `DDLWorker` (executes tasks) and `DDLWorkerClnr`
(cleans old tasks from `task_queue/ddl/`).

If either is missing, the only reliable recovery is a `clickhouse-server`
restart. Capture
`/var/log/clickhouse-server/clickhouse-server.err.log` and the matching
`clickhouse-server.log` window first — the crash reason is usually visible
there and you'll want it to file a bug.

You can tune the cleaner from `config.xml`:

```xml
<clickhouse>
    <distributed_ddl>
        <path>/clickhouse/task_queue/ddl</path>
        <pool_size>1</pool_size>
        <max_tasks_in_queue>1000</max_tasks_in_queue>
        <task_max_lifetime>604800</task_max_lifetime>
        <cleanup_delay_period>60</cleanup_delay_period>
    </distributed_ddl>
</clickhouse>
```

Defaults:

- **cleanup_delay_period** = `60` seconds — how often the cleaner runs.
- **task_max_lifetime** = `604800` seconds (1 week) — older tasks are deleted.
- **max_tasks_in_queue** = `1000` — soft cap on retained tasks.
- **pool_size** = `1` — how many `ON CLUSTER` queries run concurrently.

## Too intensive stream of ON CLUSTER commands

Generally this is a design problem, but `pool_size` can be raised so more
DDLs run in parallel on each node (the default is `1`). Raise it gradually
and watch ZooKeeper write rate and per-node memory — every additional
concurrent DDL can trigger heavy operations (mutations, ALTERs) that compete
for memory and replication queue slots.

If raising `pool_size` doesn't keep up, the fix is upstream: batch the DDLs,
replace cluster-wide `DELETE WHERE …` with lightweight deletes or partition
drops, or use `CREATE TEMPORARY TABLE` for transient intermediates so the
per-session table is dropped automatically.

## Stuck DDL tasks in the `distributed_ddl_queue`

`ON CLUSTER` tasks can pile up when many DDLs (thousands of
CREATE/DROP/ALTER) hit the cluster at once — common in heavy ETL jobs. They
show up in `system.distributed_ddl_queue` as long-`query_create_time` rows
that aren't moving.

If the DDL finished on some replicas but failed on others, the simplest fix is
to rerun the failed statement on the missing replicas **without** `ON
CLUSTER`. If most failed, check `system.distributed_ddl_queue` on every node —
the backlog is often in the thousands.

Snapshot the queue first so you don't lose the state:

```sql
CREATE TABLE default.system_distributed_ddl_queue
AS SELECT * FROM system.distributed_ddl_queue;
```

Then work through the snapshot, executing the missing statements locally and
fixing the pipeline that's spamming `ON CLUSTER`. `CREATE TEMPORARY TABLE`
plus `ALTER TABLE final ATTACH PARTITION FROM TABLE temp` is a common way to
avoid cluster-wide DDLs for staging.
