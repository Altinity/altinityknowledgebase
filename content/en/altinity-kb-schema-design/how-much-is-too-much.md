---
title: "How much is too much?"
linkTitle: "How much is too much?"
weight: 100
description: >-
      ClickHouse Limitations.
---

## How much is too much?

In most of the cases clickhouse don't have any hard limits. But obsiously there there are some practical limitation / barriers for different things - often they are caused by some system / network / filesystem limitation.

So after reaching some limits you can get different kind of problems, usually it never a failures / errors, but different kinds of degradations (slower queries / high cpu/memory usage, extra load on the network / zookeeper etc).

While those numbers can vary a lot depending on your hardware & settings there is some safe 'Goldilocks' zone where ClickHouse work the best with default settings & usual hardware.

### Number of tables (system-wide, across all databases)

- non-replicated MergeTree-family tables = few thousands is still acceptable, if you don't do realtime inserts in more that few dozens of them. See [32259](https://github.com/ClickHouse/ClickHouse/issues/32259)
- ReplicatedXXXMergeTree = few hundreds is still acceptable, if you don't do realtime inserts in more that few dozens of them. See [31919](https://github.com/ClickHouse/ClickHouse/issues/31919)
- Log family table = even dozens of thousands is still ok, especially if database engine = Lazy is used.

### Number of databases 

Fewer than number of tables (above). Dozens / hundreds is usually still acceptable.

### Number of columns in the table

Up to a few hundreds. With thousands of columns the inserts / background merges may become slower / require more of RAM. See for example https://github.com/ClickHouse/ClickHouse/issues/6943

### ClickHouse instances on a single node / VM

One is enough. Single ClickHouse can use resources of the node very efficiently, and it may require some complicated tuning to run several instances on a single node.

### Number of parts / partitions (system-wide, across all databases)

More than several dozens thousands may lead to performance degradation.

### Number of tables & partitions touched by a single insert

If you have realtime / frequent inserts no more than few. 

For the inserts are rare - up to couple of dozens.

### Disk size per shard

Less than 10TB of compressed data per server. Bigger disk are harder to replace / resync. 

### Number of shards

Dozens is still ok. More may require having more complex (non-flat) routing.

### Number of replicas in a single shard 

- 6-8 is still ok. If you have more - it can impact the zookeeper traffic.

## Number of zookeeper nodes in the ensemble 

3 (Three) for most of the cases is enough (you can loose one node). Using more nodes allows to scale up read throughput for zookeeper, but don't improve writes at all.

