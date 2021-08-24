---
title: "Shutting down a node"
linkTitle: "Shutting down a node"
description: >
    Shutting down a node
---
It’s possible to shutdown server on fly, but that would lead to failure of some queries.

More safer way:

* Remove server (which is going to be disabled) from remote_server section of config.xml on all servers.
* Remove server from load balancer, so new queries wouldn’t hit it.
* Wait until all already running queries would finish execution on it.
  It’s possible to check it via query:

  ```sql
  SHOW PROCESSLIST;
  ```

* Run sync replica query in related shard replicas via query:

  ```sql
  SYSTEM SYNC REPLICA db.table;
  ```

* Shutdown server.

`SYSTEM SHUTDOWN` query doesn’t wait until query completion and tries to kill all queries immediately after receiving signal, even if there is setting `shutdown_wait_unfinished`.

[https://github.com/ClickHouse/ClickHouse/blob/master/programs/server/Server.cpp\#L1353](https://github.com/ClickHouse/ClickHouse/blob/master/programs/server/Server.cpp#L1353)
