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
* Detach Kafka / Rabbit tables (if used), and Materialized* databases.
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

`SYSTEM SHUTDOWN` query doesn’t wait until query completion and tries to kill all queries immediately after receiving signal, even if setting `shutdown_wait_unfinished` being used.

[https://github.com/ClickHouse/ClickHouse/blob/master/programs/server/Server.cpp\#L1353](https://github.com/ClickHouse/ClickHouse/blob/master/programs/server/Server.cpp#L1353)
