---
title: "Timeouts during OPTIMIZE FINAL"
linkTitle: "Timeouts during OPTIMIZE FINAL"
weight: 100
description: >-
     `Timeout exceeded ...` or `executing longer than distributed_ddl_task_timeout`  during `OPTIMIZE FINAL`.
---

## `Timeout exceeded ...` or `executing longer than distributed_ddl_task_timeout`  during `OPTIMIZE FINAL`

Timeout may occur
1) due to the fact that the client reach timeout interval.
    - in case of TCP / native clients - you can change send_timeout / recieve_timeout + tcp_keep_alive_timeout + driver timeout settings
    - in case of HTTP clients - you can change http_send_timeout / http_receive_timeout + tcp_keep_alive_timeout + driver timeout settings

2) (in the case of ON CLUSTER queries) due to the fact that the timeout for query execution by shards ends
    - see setting `distributed_ddl_task_timeout`

In the first case you additionally may get the misleading messages: `Cancelling query. ... Query was cancelled.`

In both cases, this does NOT stop the execution of the OPTIMIZE command. It continues to work even after
the client is disconnected. You can see the progress of that in `system.processes` / `show processlist` / `system.merges` / `system.query_log`.

The same applies to queries like:

- `INSERT ... SELECT`
- `CREATE TABLE ...  AS SELECT`
- `CREATE MATERIALIZED VIEW ... POPULATE ...`

It is possible to run a query with some special `query_id` and then poll the status from the processlist (in the case of a cluster, it can be a bit more complicated).

See also 
- https://github.com/ClickHouse/ClickHouse/issues/6093
- https://github.com/ClickHouse/ClickHouse/issues/7794
- https://github.com/ClickHouse/ClickHouse/issues/28896 
- https://github.com/ClickHouse/ClickHouse/issues/19319
