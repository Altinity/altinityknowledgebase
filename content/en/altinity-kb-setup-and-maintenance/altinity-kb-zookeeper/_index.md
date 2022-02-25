---
title: "ZooKeeper"
linkTitle: "ZooKeeper"
description: >
    ZooKeeper
---

### Requirements

TLDR version:

1) USE DEDICATED FAST DISKS for the transaction log! (crucial for performance due to write-ahead-log, NVMe is preferred for heavy load setup).
2) use 3 nodes (more nodes = slower quorum, less = no HA).
3) low network latency between zookeeper nodes is very important (latency, not bandwidth).
4) have at least 4Gb of RAM, disable swap, [tune JVM sizes, and garbage collector settings](https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-zookeeper/jvm-sizes-and-garbage-collector-settings/)
5) ensure that zookeeper will not be CPU-starved by some other processes
6) [monitor zookeeper](https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-zookeeper/zookeeper-monitoring/).

Side note:
in many cases, the slowness of the zookeeper is actually a symptom of some issue with clickhouse schema/usage pattern (the most typical issues: an enormous number of partitions/tables/databases with real-time inserts, tiny & frequent inserts).

### How to install

* [https://docs.altinity.com/operationsguide/clickhouse-zookeeper/zookeeper-installation/](https://docs.altinity.com/operationsguide/clickhouse-zookeeper/zookeeper-installation/)
* [altinity-kb-setup-and-maintenance/altinity-kb-zookeeper/install_ubuntu/](/altinity-kb-setup-and-maintenance/altinity-kb-zookeeper/install_ubuntu/)

### Random links on best practices

* [https://docs.confluent.io/platform/current/zookeeper/deployment.html](https://docs.confluent.io/platform/current/zookeeper/deployment.html)
* [https://zookeeper.apache.org/doc/r3.4.9/zookeeperAdmin.html\#sc_commonProblems](https://zookeeper.apache.org/doc/r3.4.9/zookeeperAdmin.html#sc_commonProblems)
* [https://clickhouse.tech/docs/en/operations/tips/\#zookeeper](https://clickhouse.tech/docs/en/operations/tips/#zookeeper)
* [https://lucene.apache.org/solr/guide/7_4/setting-up-an-external-zookeeper-ensemble.html](https://lucene.apache.org/solr/guide/7_4/setting-up-an-external-zookeeper-ensemble.html)
* [https://cwiki.apache.org/confluence/display/ZOOKEEPER/Troubleshooting](https://cwiki.apache.org/confluence/display/ZOOKEEPER/Troubleshooting)

Cite from [https://zookeeper.apache.org/doc/r3.5.7/zookeeperAdmin.html\#sc_commonProblems](https://zookeeper.apache.org/doc/r3.5.7/zookeeperAdmin.html#sc_commonProblems) :

> ## Things to Avoid
>
> Here are some common problems you can avoid by configuring ZooKeeper correctly:
>
> * _inconsistent lists of servers_ : The list of ZooKeeper servers used by the clients must match the list of ZooKeeper servers that each ZooKeeper server has. Things work okay if the client list is a subset of the real list, but things will really act strange if clients have a list of ZooKeeper servers that are in different ZooKeeper clusters. Also, the server lists in each Zookeeper server configuration file should be consistent with one another.
> * _incorrect placement of transaction log_ : The most performance critical part of ZooKeeper is the transaction log. ZooKeeper syncs transactions to media before it returns a response. A dedicated transaction log device is key to consistent good performance. Putting the log on a busy device will adversely affect performance. If you only have one storage device, increase the snapCount so that snapshot files are generated less often; it does not eliminate the problem, but it makes more resources available for the transaction log.
> * _incorrect Java heap size_ : You should take special care to set your Java max heap size correctly. In particular, you should not create a situation in which ZooKeeper swaps to disk. The disk is death to ZooKeeper. Everything is ordered, so if processing one request swaps the disk, all other queued requests will probably do the same. the disk. DON'T SWAP. Be conservative in your estimates: if you have 4G of RAM, do not set the Java max heap size to 6G or even 4G. For example, it is more likely you would use a 3G heap for a 4G machine, as the operating system and the cache also need memory. The best and only recommend practice for estimating the heap size your system needs is to run load tests, and then make sure you are well below the usage limit that would cause the system to swap.
> * _Publicly accessible deployment_ : A ZooKeeper ensemble is expected to operate in a trusted computing environment. It is thus recommended to deploy ZooKeeper behind a firewall.


### How to check number of followers:

```bash
echo mntr | nc zookeeper 2187 | grep foll
zk_synced_followers    2
zk_synced_non_voting_followers    0
zk_avg_follower_sync_time    0.0
zk_min_follower_sync_time    0
zk_max_follower_sync_time    0
zk_cnt_follower_sync_time    0
zk_sum_follower_sync_time    0
```

## Tools

[https://github.com/apache/zookeeper/blob/master/zookeeper-docs/src/main/resources/markdown/zookeeperTools.md](https://github.com/apache/zookeeper/blob/master/zookeeper-docs/src/main/resources/markdown/zookeeperTools.md)

## Alternatives for zkCli

* [https://github.com/go-zkcli/zkcli](https://github.com/go-zkcli/zkcli)
* [https://github.com/outbrain/zookeepercli](https://github.com/outbrain/zookeepercli)
* [https://idata.co.il/2018/07/a-day-at-the-zoo-graphic-uis-for-apache-zookeeper/](https://idata.co.il/2018/07/a-day-at-the-zoo-graphic-uis-for-apache-zookeeper/)

## Web UI

* [https://github.com/elkozmon/zoonavigator-api](https://github.com/elkozmon/zoonavigator-api)
* [https://github.com/tobilg/docker-zookeeper-webui](https://github.com/tobilg/docker-zookeeper-webui)
* [https://github.com/vran-dev/PrettyZoo](https://github.com/vran-dev/PrettyZoo)
