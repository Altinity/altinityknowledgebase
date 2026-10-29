---
title: "Unblocking a stuck DDL queue by writing to system.zookeeper"
linkTitle: "Unblock the DDL queue with system.zookeeper"
description: >
    Mark a stuck ON CLUSTER task as finished with INSERT INTO system.zookeeper, without touching the queue by hand in Keeper.
keywords:
  - distributed_ddl_queue
  - allow_zookeeper_write
  - ON CLUSTER stuck
  - UNFINISHED
---

A distributed DDL task (`ON CLUSTER`) that never finishes blocks every task queued behind it on that host, because each host's `DDLWorker` runs the queue in order. You see `Unexpected error (N times in a row) ... maximum retries exceeded (UNFINISHED)` in the server log and a growing list of `Inactive` rows in `system.distributed_ddl_queue`.

If the task's effect is already applied (or you no longer want it), unblock the queue by writing the flag the worker waits for. `INSERT INTO system.zookeeper` does this. It is safer than `rmr` on the queue: you write one znode per host and leave the other entries alone.

It also needs no restart. The `INSERT` writes the same `finished` and `executed` znodes the worker writes itself, and the worker checks for them each time it retries a task. A 26.3 cluster drained its queue this way without a pod restart.

`DDLWorker` keeps its queue position and unfinished tasks in memory, so deleting a task it is still retrying may leave it out of sync with Keeper. On 26.10, `rmr` on a finished entry and on the whole queue path both worked without a restart. We did not test `rmr` on a task the worker is retrying, or on older builds.

{{<mermaid>}}
flowchart TD
  A["Oldest entry with status != Finished<br/>(system.distributed_ddl_queue)"] --> B{"Is its effect applied<br/>or no longer needed?"}
  B -- "No" --> X["Fix the cause first<br/>(this article does not apply)"]
  B -- "Yes" --> C{"Any shards/&lt;shard&gt;/tries_to_execute &gt; 3<br/>and no shards/&lt;shard&gt;/executed?"}
  C -- "Yes (replicated-table ALTER)" --> D["Recipe B: create shards/&lt;shard&gt;/executed<br/>then Recipe A if rows stay Inactive"]
  C -- "No" --> E["Recipe A: create finished/&lt;host:port&gt;<br/>for each non-Finished host"]
  D --> V["Verify in system.distributed_ddl_queue"]
  E --> V
{{</mermaid>}}

## Prerequisites

- `allow_zookeeper_write` is a **server config** key, not a user setting. Without it, `INSERT` fails with `Prohibit writing to system.zookeeper, unless config allow_zookeeper_write as true` (`BAD_ARGUMENTS`). Put it in `config.d/`, and remove it when you are done:

```xml
<clickhouse>
    <allow_zookeeper_write>true</allow_zookeeper_write>
</clickhouse>
```

- `INSERT INTO system.zookeeper` and its `allow_zookeeper_write` gate arrived in 22.6 (upstream commits from 2022-05-27 and 2022-06-01) and were backported to the 22.3 LTS from 22.3.16.
- The recipes use the default queue path `/clickhouse/task_queue/ddl` and the default Keeper. If `distributed_ddl.path` differs (check `system.server_settings`), replace the path in every query. If your queue is on an auxiliary Keeper, also set the `zookeeperName` column and filter on it when you read.
- The user needs the `INSERT` grant on `system.zookeeper`.
- Reading with `path LIKE ...` needs `SETTINGS allow_unrestricted_reads_from_keeper = 1`. An exact `path = '...'` filter does not.

## What an INSERT does

Only `name`, `value`, `path` and `zookeeperName` are writable; every other column is `MATERIALIZED` (`INSERT` returns `ILLEGAL_COLUMN`).

```sql
SELECT name, type, default_kind FROM system.columns
WHERE database = 'system' AND table = 'zookeeper' ORDER BY position;
```

- Each row creates the znode `<path>/<name>`, or sets its value if it exists (no version check). Missing parent znodes are created too. A typo in `path` therefore creates bogus nodes instead of failing.
- All rows of one `INSERT` go to Keeper as one transaction per Keeper cluster.
- There is no delete. Removing a znode needs `clickhouse-keeper-client` or `zkCli`.
- `name` cannot contain `/`.

## The znodes of a DDL task

{{<mermaid>}}
graph LR
  Q["/clickhouse/task_queue/ddl/query-0000000004"] --> ACT["active/"]
  Q --> FIN["finished/"]
  Q --> SH["shards/"]
  FIN --> F1["localhost:9000  =  0 (status OK)"]
  SH --> S1["localhost:9000 (shard node)"]
  S1 --> T["tries_to_execute  =  1"]
  S1 --> EX["executed  =  localhost:9000"]
{{</mermaid>}}

The diagram uses the default `distributed_ddl.path`. Check yours in `system.server_settings`.

- `finished/<host>:<port>`: one child per host that completed the task. Value `0\n` means success (exception code 0). The name is the host name escaped with `escapeForFileName` (everything except `[A-Za-z0-9_]` becomes `%XX`: `-` is `%2D`, `.` is `%2E`).
- `shards/<shard>/executed`: for `ALTER` on replicated tables only one replica per shard executes; the others wait for this node. `tries_to_execute` counts attempts by the executor. The value of `executed` is informational; only its existence matters.
- The `<shard>` node name is **not** escaped: it is the shard's replica names, sorted and joined with `,` (for example `host-a:9000,host-b:9000`). Its `executed` value **is** escaped.

Copy names from `system.zookeeper` or `system.distributed_ddl_queue` instead of typing them.

## Recipe A: mark a task finished on the hosts that did not finish it

Find the oldest non-finished entry:

```sql
SELECT entry, host, port, status, exception_code, query
FROM system.distributed_ddl_queue
WHERE status != 'Finished'
ORDER BY entry, host LIMIT 20;
```

Create the `finished` znode for those hosts, taking the entry id from the view (never type a new `query-NNN` id):

```sql
INSERT INTO system.zookeeper (name, path, value)
SELECT concat(replaceAll(replaceAll(host, '-', '%2D'), '.', '%2E'), ':', toString(port)),
       concat('/clickhouse/task_queue/ddl/', entry, '/finished'),
       '0\n'
FROM system.distributed_ddl_queue
WHERE entry = 'query-0000000004' AND status != 'Finished';
```

The `replaceAll` pair is exact for DNS names and IPv4 addresses. For IPv6 literals, copy the real name from `finished/` of another entry.

## Recipe B: set the shard `executed` flag

Use it when the shard node has `tries_to_execute` above 3 and no `executed` child:

```sql
SELECT name, value FROM system.zookeeper
WHERE path = '/clickhouse/task_queue/ddl/query-0000000004/shards/<shard node>';
```

```sql
INSERT INTO system.zookeeper (name, path, value)
SELECT 'executed', concat(path, '/', name),
       replaceAll(replaceAll(splitByChar(',', name)[1], '-', '%2D'), '.', '%2E')
FROM system.zookeeper
WHERE path = '/clickhouse/task_queue/ddl/query-0000000004/shards'
  AND name = '<shard node, copied from the listing>';
```

The waiting replicas then treat the task as executed and finish it themselves. If a row stays `Inactive`, follow with Recipe A.

## Verify

```sql
SELECT host, status, exception_code FROM system.distributed_ddl_queue
WHERE entry = 'query-0000000004';
```

Then count what is still blocked: `SELECT host, status, count() FROM system.distributed_ddl_queue WHERE status != 'Finished' GROUP BY host, status`.

## Before you run it

- **Finished is not executed.** Nothing runs the DDL. Check its effect first (for example `system.columns` or `system.data_skipping_indices` on every replica), and re-run the DDL by hand if it did not apply.
- **The backlog replays.** The next entries start executing in order as soon as the head is finished. Pause pipelines that issue DDL, and read the queued statements first.
- **A wrong name doesn't unblock the task.** With an unescaped host (`ghost-host.example.com:9000`) the original row stays `Inactive` and the view shows an extra phantom host row. Remove the stray node with `clickhouse-keeper-client`.
- **A malformed entry breaks reads.** If you rewrite an entry's `value` (for example the `hosts:` list) in the wrong format, `system.distributed_ddl_queue` fails with `CANNOT_PARSE_QUOTED_STRING`.
- **Don't wait for the cleanup.** It purges entries older than `task_max_lifetime` (default 7 days) or more than `max_tasks_in_queue` (default 1000) behind the newest one. That unblocks the head too, but it silently drops the purged entries without running them.

## Version notes

- The recipes were tested on 26.10 with a single-node `default` cluster, which covers the znode layout, escaping and status transitions.
- When a task exhausts its retries, it ends as `UNFINISHED` and the worker retries it forever. Upstream fixed this in 26.8 ([PR 108505](https://github.com/ClickHouse/ClickHouse/pull/108505)), so 26.10 does not reproduce it. We have seen it on Altinity 26.3 builds.
- Recipe A has been used on a 3-replica 26.3 cluster and drained the queue. Recipe B follows the worker's source code and has been verified at the znode level only.

## Related resources

- [There are N unfinished hosts (0 of them are currently active)](/altinity-kb-setup-and-maintenance/altinity-kb-ddlworker/there-are-n-unfinished-hosts-0-of-them-are-currently-active/)
- [system.zookeeper](https://clickhouse.com/docs/operations/system-tables/zookeeper)
