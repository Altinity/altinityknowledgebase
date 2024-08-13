---
title: "ZooKeeper backup"
linkTitle: "ZooKeeper backup"
description: >
    ZooKeeper backup
---

Question: Do I need to backup Zookeeper Database, because it’s pretty important for ClickHouse®?

TLDR answer: **NO, just backup ClickHouse data itself, and do SYSTEM RESTORE REPLICA during recovery to recreate zookeeper data**

Details:

Zookeeper does not store any data, it stores the STATE of the distributed system ("that replica have those parts", "still need 2 merges to do", "alter is being applied" etc). That state always changes, and you can not capture / backup / and recover that state in a safe manner. So even backup from few seconds ago is representing some 'old state from the past' which is INCONSISTENT with actual state of the data.

In other words - if ClickHouse is working - then the state of distributed system always changes, and it's almost impossible to collect the current state of zookeeper (while you collecting it it will change many times). The only exception is 'stop-the-world' scenario - i.e. shutdown all ClickHouse nodes, with all other zookeeper clients, then shutdown all the zookeeper, and only then take the backups, in that scenario and backups of zookeeper & ClickHouse will be consistent. In that case restoring the backup is as simple (and is equal to) as starting all the nodes which was stopped before. But usually that scenario is very non-practical because it requires huge downtime.

So what to do instead? It's enough if you will backup ClickHouse data itself, and to recover the state of zookeeper you can just run the command `SYSTEM RESTORE REPLICA` command **AFTER** restoring the ClickHouse data itself. That will recreate the state of the replica in the zookeeper as it exists on the filesystem after backup recovery.

Normally Zookeeper ensemble consists of 3 nodes, which is enough to survive hardware failures.

On older version (which don't have `SYSTEM RESTORE REPLICA` command  - it can be done manually, using instruction https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/replication/#converting-from-mergetree-to-replicatedmergetree), on scale you can try [https://github.com/Altinity/clickhouse-zookeeper-recovery](https://github.com/Altinity/clickhouse-zookeeper-recovery)
