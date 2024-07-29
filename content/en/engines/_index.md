---
title: "Engines"
linkTitle: "Engines"
keywords:
- clickhouse engine
- clickhouse mergetree
description: >
    Learn about ClickHouse® engines, from MergeTree, Atomic Database to RocksDB.
weight: 1
---
Generally: the **main** engine in ClickHouse® is called [MergeTree](/engines/mergetree-table-engine-family/). It allows to store and process data on one server and feel all the advantages of ClickHouse. Basic usage of MergeTree does not require any special configuration, and you can start using it 'out of the box'.

But one server and one copy of data are not fault-tolerant - something can happen with the server itself, with datacenter availability, etc. So you need to have the replica(s) - i.e. server(s) with the same data and which can 'substitute' the original server at any moment.

To have an extra copy (replica) of your data you need to use [ReplicatedMergeTree](/altinity-kb-setup-and-maintenance/altinity-kb-converting-mergetree-to-replicated/) engine. It can be used _instead_ of MergeTree engine, and you can always upgrade from MergeTree to ReplicatedMergeTree (and downgrade back) if you need. To use that you need to have 
[ZooKeeper installed](https://docs.altinity.com/operationsguide/clickhouse-zookeeper/zookeeper-installation/)
and running. For tests, you can use one standalone Zookeeper instance, but for production usage, you should have zookeeper ensemble at least of 3 servers.

When you use ReplicatedMergeTree then the inserted data is copied automatically to all the replicas, but all the SELECTs are executed on the single server you have connected to. So you can have 5 replicas of your data, but if you will always connect to one replica - it will not 'share' / 'balance' that traffic automatically between all the replicas, one server will be loaded and the rest will generally do nothing. If you need that balancing of load between multiple replicas - you can use the internal 'loadbalancer' mechanism which is provided by Distributed engine of ClickHouse. As an alternative in that scenario you can work without [Distributed table](/altinity-kb-setup-and-maintenance/altinity-kb-data-migration/distributed-table-cluster/), but with some external load balancer that will balance the requests between several replicas according to your specific rules or preferences, or just cluster-aware client which will pick one of the servers for the query time.

The Distributed engine does not store any data, but it can 'point' to the same ReplicatedMergeTree/MergeTree table on multiple servers. To use Distributed engine you need to configure `<cluster>` settings in your ClickHouse server config file.

So let's say you have 3 replicas of table `my_replicated_data` with ReplicatedMergeTree engine. You can create a table with Distributed engine called `my_distributed_replicated_data` which will 'point' to all of that 3 servers, and when you will select from that `my_distributed_replicated_data table` the select will be forwarded and executed on one of the replicas. So in that scenario, each replica will get 1/3 of requests (but each request still will be fully executed on one chosen replica).

All that is great, and will work well while one copy of your data is fitting on a single physical server, and can be processed by the resources of one server. When you have too much data to be stored/processed on one server - you need to use sharding (it's just a way to split the data into smaller parts). Sharding is the mechanism also provided by Distributed engine.

With sharding data is divided into parts (shards) according to some sharding key. You can just use random distribution, so let's say - throw a coin to decide on each of the servers the data should be stored, or you can use some 'smarter' sharding scheme, to make the data connected to the same subject (let's say to the same customer) stored on one server, and to another subject on another. So in that case all the shards should be requested at the same time and later the 'common' result should be calculated.

In ClickHouse each shard works independently and process its part of data, inside each shard replication can work. And later to query all the shards at the same time and combine the final result - Distributed engine is used. So Distributed work as load balancer inside each shard, and can combine the data coming from different shards together to make the 'common' result.

You can use Distributed table for inserts, in that case, it will pass the data to one of the shards according to the sharding key. Or you can insert to the underlying table on one of the shards bypassing the Distributed table.

### Short summary

1. start with MergeTree
2. to have several copies of data use ReplicatedMergeTree
3. if your data is too big to fit/ to process on one server - use sharding
4. to balance the load between replicas and to combine the result of selects from different shards - use [Distributed table](/altinity-kb-setup-and-maintenance/altinity-kb-data-migration/distributed-table-cluster/).

#### More

Please check [@alex-zaitsev](https://github.com/alex-zaitsev) presentation, which covers that subject: [https://www.youtube.com/watch?v=zbjub8BQPyE](https://www.youtube.com/watch?v=zbjub8BQPyE)
 ( Slides are here: [https://yadi.sk/i/iLA5ssAv3NdYGy](https://yadi.sk/i/iLA5ssAv3NdYGy) )

P.S. Actually you can create replication without Zookeeper and ReplicatedMergeTree, just by using the Distributed table above MergeTree and internal_replication=false cluster setting, but in that case, there will be no guarantee that all the replicas will have 100% the same data, so I rather would not recommend that scenario.

See also: [ReplacingMergeTree does not collapse duplicates]({{<ref "mergetree-table-engine-family/replacingmergetree/altinity-kb-replacingmergetree-does-not-collapse-duplicates.md" >}})

Based on my original answer on github: [https://github.com/ClickHouse/ClickHouse/issues/2161](https://github.com/ClickHouse/ClickHouse/issues/2161)
