---
title: "Exactly once semantics"
linkTitle: "Exactly once semantics"
description: >
    Exactly once semantics
---
EOS consumer (isolation.level=read_committed) is enabled by default since librdkafka 1.2.0, so for ClickHouse - since 20.2

See:

* [edenhill/librdkafka@6b2a155](https://github.com/edenhill/librdkafka/commit/6b2a1552ac2a4ea09d915015183f268dd2df96e6)
* [9de5dff](https://github.com/ClickHouse/ClickHouse/commit/9de5dffb5c97eb93545ae25eaf87ec195a590148)

There was a report recently that it was giving some duplicates [\#18668](https://github.com/ClickHouse/ClickHouse/issues/18668) and in should be fixed in 21.2.

BUT: while EOS semantics will guarantee you that no duplicates will happen on the Kafka side (i.e. even if you produce the same messages few times it will be consumed once), but ClickHouse as a Kafka client can currently guarantee only at-least-once. And in some corner cases (connection lost etc) you can get duplicates.

We need to have something like transactions on ClickHouse side to be able to avoid that. Adding something like simple transactions is in plans for Y2021.
