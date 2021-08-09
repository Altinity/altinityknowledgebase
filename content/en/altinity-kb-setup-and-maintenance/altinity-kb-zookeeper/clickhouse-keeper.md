---
title: "clickhouse-keeper"
linkTitle: "clickhouse-keeper"
description: >
    clickhouse-keeper
---

In 21.3 there is already an option to run own clickhouse zookeeper implementation. It's still experimental, and still need to be started additionally on few nodes \(similar to 'normal' zookeeper\) and speaks normal zookeeper protocol - needed to simplify A/B tests with real zookeeper.

No docs, for now, only PR with code & tests. Of course, if you want to play with it - you can, and early feedback is very valuable. But be prepared for a lot of tiny issues here and there, so don't be disappointed if it will not satisfy your expectations for some reason. It's very-very fresh :slightly\_smiling\_face: It's ready for some trial runs, but not ready yet for production use cases.

To test that you need to run 3 instances of clickhouse-server \(which will mimic zookeeper\) with an extra config like that:

[https://github.com/ClickHouse/ClickHouse/blob/c8b1004ecb4bfc4aa581dbcbbbe3a4c72ce57123/tests/integration/test\_keeper\_multinode\_simple/configs/enable\_keeper1.xml](https://github.com/ClickHouse/ClickHouse/blob/c8b1004ecb4bfc4aa581dbcbbbe3a4c72ce57123/tests/integration/test_keeper_multinode_simple/configs/enable_keeper1.xml)

[https://github.com/ClickHouse/ClickHouse/blob/c8b1004ecb4bfc4aa581dbcbbbe3a4c72ce57123/tests/integration/test\_keeper\_snapshots/configs/enable\_keeper.xml](https://github.com/ClickHouse/ClickHouse/blob/c8b1004ecb4bfc4aa581dbcbbbe3a4c72ce57123/tests/integration/test_keeper_snapshots/configs/enable_keeper.xml)

or event single instance with config like that: [https://github.com/ClickHouse/ClickHouse/blob/master/tests/config/config.d/keeper\_port.xml](https://github.com/ClickHouse/ClickHouse/blob/master/tests/config/config.d/keeper_port.xml)  
[https://github.com/ClickHouse/ClickHouse/blob/master/tests/config/config.d/zookeeper.xml](https://github.com/ClickHouse/ClickHouse/blob/master/tests/config/config.d/zookeeper.xml)

And point all the clickhouses \(zookeeper config secton\) to those nodes / ports.

Latest testing version is recommended. We will be thankful for any feedback.

© 2021 Altinity Inc. All rights reserved.

