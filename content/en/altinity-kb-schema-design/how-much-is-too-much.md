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

- non-replicated MergeTree-family tables = few thousands is still acceptable, if you don't do realtime inserts in more that few dozens of them. See [#32259](https://github.com/ClickHouse/ClickHouse/issues/32259)
- ReplicatedXXXMergeTree = few hundreds is still acceptable, if you don't do realtime inserts in more that few dozens of them. Every Replicated table comes with it's own cost (need to do housekeepeing operations, monitoing replication queues etc). See [#31919](https://github.com/ClickHouse/ClickHouse/issues/31919)
- Log family table = even dozens of thousands is still ok, especially if database engine = Lazy is used.

### Number of databases 

Fewer than number of tables (above). Dozens / hundreds is usually still acceptable.

### Number of inserts per seconds

For usual (non async) inserts - dozen is enough. Every insert creates a part, if you will create parts too often, clickhouse will not be able to merge them and you will be getting 'too many parts'.

### Number of columns in the table

Up to a few hundreds. With thousands of columns the inserts / background merges may become slower / require more of RAM.
See for example https://github.com/ClickHouse/ClickHouse/issues/6943 https://github.com/ClickHouse/ClickHouse/issues/27502 

### ClickHouse instances on a single node / VM

One is enough. Single ClickHouse can use resources of the node very efficiently, and it may require some complicated tuning to run several instances on a single node.

### Number of parts / partitions (system-wide, across all databases)

More than several dozens thousands may lead to performance degradation: slow starts (see https://github.com/ClickHouse/ClickHouse/issues/10087 ).

### Number of tables & partitions touched by a single insert

If you have realtime / frequent inserts no more than few. 

For the inserts are rare - up to couple of dozens.

### Number of parts in the single table

More than ~ 5 thousands may lead to issues with alters in Replicated tables (caused by `jute.maxbuffer` overrun, see [details](../altinity-kb-setup-and-maintenance/zookeeper-session-expired.md) ), and query speed degradation.

### Disk size per shard

Less than 10TB of compressed data per server. Bigger disk are harder to replace / resync. 

### Number of shards

Dozens is still ok. More may require having more complex (non-flat) routing.

### Number of replicas in a single shard 

2 is minimum for HA. 3 is a 'golden standard'. Up to 6-8 is still ok. If you have more with realtime inserts - it can impact the zookeeper traffic.

### Number of zookeeper nodes in the ensemble 

3 (Three) for most of the cases is enough (you can loose one node). Using more nodes allows to scale up read throughput for zookeeper, but don't improve writes at all.

### Number of materialized view attached to a single table.

Up to few. The less the better if the table is getting realtime inserts. (no matter if MV are chained or all are feeded from the same source table). 

The more you have the more costy your inserts are, and the bigger risks to get some inconsitencies between some MV (inserts to MV and main table are not atomic).

If the table don't have realtime inserts you can have more MV. 

### Number of projections inside a single table.

Up to few. Similar to MV above. 

### Number of secondary indexes a single table.

One to about a dozen. Different types of indexes has different penalty, bloom_filter is 100 times heavier than min_max index
At some point your inserts will slow down. Try to create possible minimum of indexes.
You can combine many columns into a single index and this index will work for any predicate but create less impact. 

### Number of Kafka tables / consumers inside 

High number of Kafka tables maybe quite expensive (every consumer = very expensive librdkafka object with several threads inside).
Usually alternative approaches are preferrable (mixing several datastreams in one topic, denormalizing, consuming several topics of identical structure with a single Kafka table, etc).

If you really need a lot of Kafka tables you may need more ram / CPU on the node and
increase `background_message_broker_schedule_pool_size` (default is 16) to the number of Kafka tables.
