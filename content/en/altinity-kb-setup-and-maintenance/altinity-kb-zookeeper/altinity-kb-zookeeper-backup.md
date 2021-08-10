---
title: "ZooKeeper backup"
linkTitle: "ZooKeeper backup"
description: >
    ZooKeeper backup
---

You may have a question: “Do I need to backup Zookeeper Database, because it’s pretty important for ClickHouse?”

Answer: _ZK is in memory database. All nodes of ZK has exactly the same data._

_If you have 3 ZK servers, then you have 3 copies of \(3 backups\) already._

_To backup ZK has no sense because you need to have a snapshot of ZK + last ZK logs to exactly the last ZK transaction._

_You cannot use ZK database backed up 3 hours ago or 3 minutes ago._

_ZK restored from the backup will be inconsistent with CH database._

_Answer2: Usually, it doesn't have too much sense. It's very hard to take zookeeper snapshot at exactly the same state as clickhouse. \(well maybe if you will turn of clickhouses, then you can take snapshots of clickhouse AND zookeepers\). So for example on clouds if you can stop all nodes and take disk snapshots - it will just work._

_But while clickhouse is working it's almost impossible to collect the current state of zookeeper._

_You need to restore zookeeper and clickhouse snapshots from EXACTLY THE SAME moment of time - no procedure is needed. Just start & run._

_Also, that allows only to snapshot of clickhouse & zookeeper as a whole. You can not do partial backups then._

_If you lose zookeeper data while having clickhouse data \(or backups of clickhouse data\) - you can restore the zookeeper state from clickhouse state._

_With a couple of tables, it can be done manually._

_On scale, you can use_ [https://github.com/Altinity/clickhouse-zookeeper-recovery](https://github.com/Altinity/clickhouse-zookeeper-recovery)

_In future it will be even simpler_ [https://github.com/ClickHouse/ClickHouse/pull/13652](https://github.com/ClickHouse/ClickHouse/pull/13652)



