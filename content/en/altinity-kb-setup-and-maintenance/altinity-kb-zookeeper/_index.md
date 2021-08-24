---
title: "ZooKeeper"
linkTitle: "ZooKeeper"
description: >
    ZooKeeper
---
Article on docs site:

[https://docs.altinity.com/operationsguide/clickhouse-zookeeper/"](https://docs.altinity.com/operationsguide/clickhouse-zookeeper/")

Check number of followers:

```text
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
