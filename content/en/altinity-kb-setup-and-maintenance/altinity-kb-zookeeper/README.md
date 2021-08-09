---
title: "ZooKeeper"
linkTitle: "ZooKeeper"
description: >
    ZooKeeper
---

Article on docs site:

{% embed url="https://docs.altinity.com/operationsguide/clickhouse-zookeeper/" caption="" %}

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

## Tools <a id="Zookeeper-Tools"></a>

[https://github.com/apache/zookeeper/blob/master/zookeeper-docs/src/main/resources/markdown/zookeeperTools.md](https://github.com/apache/zookeeper/blob/master/zookeeper-docs/src/main/resources/markdown/zookeeperTools.md)

## Alternatives for zkCli: <a id="Zookeeper-AlternativesforzkCli:"></a>

* [https://github.com/go-zkcli/zkcli](https://github.com/go-zkcli/zkcli)
* [https://github.com/outbrain/zookeepercli](https://github.com/outbrain/zookeepercli)
* [https://idata.co.il/2018/07/a-day-at-the-zoo-graphic-uis-for-apache-zookeeper/](https://idata.co.il/2018/07/a-day-at-the-zoo-graphic-uis-for-apache-zookeeper/)

## Web UI: <a id="Zookeeper-WebUI:"></a>

* [https://github.com/elkozmon/zoonavigator-api](https://github.com/elkozmon/zoonavigator-api)
* [https://github.com/tobilg/docker-zookeeper-webui](https://github.com/tobilg/docker-zookeeper-webui)
* [https://github.com/vran-dev/PrettyZoo](https://github.com/vran-dev/PrettyZoo)

© 2021 Altinity Inc. All rights reserved.

