---
title: "Shutting down a node"
linkTitle: "Shutting down a node"
description: >
    Shutting down a node
---
It’s possible to shutdown server on fly, but that would lead to failure of some queries.

More safer way:

* Remove server (which is going to be disabled) from remote_server section of config.xml on all servers.
  * avoid removing the last replica of the shard (that can lead to incorrect data placement if you use non-random distribution)
* Remove server from load balancer, so new queries wouldn’t hit it.
* Detach Kafka / Rabbit / Buffer tables (if used), and Materialized* databases.
* Wait until all already running queries would finish execution on it.
  It’s possible to check it via query:

  ```sql
  SHOW PROCESSLIST;
  ```
* Ensure there is no pending data in distributed tables 

  ```sql 
  SELECT * FROM system.distribution_queue;
  SYSTEM FLUSH DISTRIBUTED <table_name>;
  ```

* Run sync replica query in related shard replicas (others than the one you remove) via query:

  ```sql
  SYSTEM SYNC REPLICA db.table;
  ```


* Shutdown server.

`SYSTEM SHUTDOWN` query by default doesn’t wait until query completion and tries to kill all queries immediately after receiving signal, if you want to change this behavior, you need to enable setting `shutdown_wait_unfinished_queries`.

[https://github.com/ClickHouse/ClickHouse/blob/d705f8ead4bdc837b8305131844f558ec002becc/programs/server/Server.cpp#L1682](https://github.com/ClickHouse/ClickHouse/blob/d705f8ead4bdc837b8305131844f558ec002becc/programs/server/Server.cpp#L1682)
