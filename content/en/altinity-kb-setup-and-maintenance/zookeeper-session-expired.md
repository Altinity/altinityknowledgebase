---
title: "Zookeeper session has expired"
linkTitle: "Zookeeper session has expired"
weight: 100
description: >-
     Zookeeper session has expired
---

> **Q. I get "Zookeeper session has expired" once. What should i do? Should I worry?**

Getting exceptions or lack of acknowledgement in distributed system from time to time is a normal situation. 
Your client should do the retry. If that happened once and your client do retries correctly - nothing to worry about.

It it happens often, or with every retry - it may be a sign of some misconfiguration / issue in cluster (see below).


> **Q. we see a lot of these: Zookeeper session has expired. Switching to a new session**

A. There is a single Zookeeper session per server. But there are many threads that can use Zookeeper simultaneously.
So the same event (we lose the single Zookeeper session we had), will be reported by all the threads/queries which were using that Zookeeper session.

Usually after loosing the Zookeeper session that exception is printed by all the thread which watch Zookeeper replication queues, and all the threads which had some in-flight Zookeeper operations (for example inserts, `ON CLUSTER` commands etc).

If you see a lot of those simultaneously - that just means you have a lot of threads talking to Zookeeper simultaneously (or may be you have many replicated tables?).

BTW: every Replicated table comes with its own cost, so you [can't scale the number of replicated tables indefinitely](/altinity-kb-schema-design/how-much-is-too-much/#number-of-tables-system-wide-across-all-databases).

Typically after several hundreds (sometimes thousands) of replicated tables, the ClickHouse® server becomes unusable: it can't do any other work, but only keeping replication housekeeping tasks. 'ClickHouse-way' is to have a few (maybe dozens) of very huge tables instead of having thousands of tiny tables. (Side note: the number of not-replicated tables can be scaled much better).

So again if during short period of time you see lot of those exceptions and that don't happen anymore for a while - nothing to worry about. Just ensure your client is doing retries properly.

> **Q. We are wondering what is causing that session to "timeout" as the default looks like 30 seconds, and there's certainly stuff happening much more frequently than every 30 seconds.** 

Typically that has nothing with an expiration/timeout - even if you do nothing there are heartbeat events in the Zookeeper protocol.

So internally inside ClickHouse:
1) we have a 'zookeeper client' which in practice is a single Zookeeper connection (TCP socket), with 2 threads - one serving reads, the seconds serving writes, and some API around.
2) while everything is ok Zookeeper client keeps a single logical 'zookeeper session' (also by sending heartbeats etc).  
3) we may have hundreds of 'users' of that Zookeeper client - those are threads that do some housekeeping, serve queries etc.
4) Zookeeper client normally have dozen 'in-flight' requests (asked by different threads). And if something bad happens with that
(disconnect, some issue with Zookeeper server, some other failure), Zookeeper client needs to re-establish the connection and switch to the new session
so all those 'in-flight' requests will be terminated with a 'session expired' exception.

> **Q. That problem happens very often (all the time, every X minutes / hours / days).** 

Sometimes the real issue can be visible somewhere close to the first 'session expired' exception in the log. (i.e. Zookeeper client thread can
know & print to logs the real reason, while all 'user' threads just get 'session expired').

Also Zookeeper logs may ofter have a clue to that was the real problem.

Known issues which can lead to session termination by Zookeeper:
1) connectivity / network issues.
2) `jute.maxbuffer` overrun. If you need to pass too much data in a single Zookeeper transaction. (often happens if you need to do ALTER table UPDATE or other mutation on the table with big number of parts). The fix is adjusting JVM setting: -Djute.maxbuffer=8388608. See https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-zookeeper/jvm-sizes-and-garbage-collector-settings/
3) XID overflow. XID is a transaction counter in Zookeeper, if you do too many transactions the counter reaches maxint32, and to restart the counter Zookeeper closes all the connections. Usually, that happens rarely, and is not avoidable in Zookeeper (well in clickhouse-keeper that problem solved). There are some corner cases / some schemas which may end up with that XID overflow happening quite often. (a worst case we saw was once per 3 weeks).

> **Q. "Zookeeper session has expired" happens every time I try to start the mutation / do other ALTER on Replicated table.** 

During ALTERing replicated table ClickHouse need to create a record in Zookeeper listing all the parts which should be mutated (that usually means = list names of all parts of the table). If the size of list of parts exceeds maximum buffer size - Zookeeper drops the connection. 

Parts name length can be different for different tables. In average with default `jute.maxbuffer` (1Mb) mutations start to fail for tables which have more than 5000 parts.

Solutions:
1) rethink partitioning, high number of parts in table is usually [not recommended](https://kb.altinity.com/altinity-kb-schema-design/how-much-is-too-much/#number-of-parts--partitions-system-wide-across-all-databases)
2) increase `jute.maxbuffer` on Zookeeper side [to values about 8M](https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-zookeeper/jvm-sizes-and-garbage-collector-settings/)
3) use IN PARTITION clause for mutations (where applicable) - since [20.12](https://github.com/ClickHouse/ClickHouse/pull/13403)
4) switch to clickhouse-keeper

> **Q. "Zookeeper session has expired and also Operation timeout" happens when reading blocks from Zookeeper**:

```bash
2024.02.22 07:20:39.222171 [ 1047 ] {} <Error> ZooKeeperClient: Code: 999. Coordination::Exception: Operation timeout (no response) for request List for path: 
/clickhouse/tables/github_events/block_numbers/20240205105000 (Operation timeout). (KEEPER_EXCEPTION), 
2024.02.22 07:20:39.223293 [ 246 ] {} <Error> default.github_events : void DB::StorageReplicatedMergeTree::mergeSelectingTask(): 
Code: 999. Coordination::Exception: /clickhouse/tables/github_events/block_numbers/20240205105000 (Connection loss). 
```

Sometimes these `Session expired` and `operation timeout` are common, because of merges that read all the blocks in Zookeeper for a table and if there are many blocks (and partitions) read time can be longer than the 10 secs default [operation timeout](https://clickhouse.com/docs/en/operations/server-configuration-parameters/settings#server-settings_zookeeper). 
When dropping a partition, ClickHouse never drops old block numbers from Zookeeper, so the list grows indefinitely. It is done as a precaution against race between DROP PARTITION and INSERT. It is safe to clean those old blocks manually

This is being addressed in **[#59507 Add `FORGET PARTITION` query to remove old partition nodes from](https://github.com/ClickHouse/ClickHouse/pull/59507)**

Solutions:
Manually remove old/forgotten blocks https://kb.altinity.com/altinity-kb-useful-queries/remove_unneeded_block_numbers/


Related issues:
- https://github.com/ClickHouse/ClickHouse/issues/16307
- https://github.com/ClickHouse/ClickHouse/issues/11933
- https://github.com/ClickHouse/ClickHouse/issues/32646
- https://github.com/ClickHouse/ClickHouse/issues/15882 
