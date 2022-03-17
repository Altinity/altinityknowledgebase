---
title: "Upgrade"
linkTitle: "Upgrade"
keywords:
- clickhouse upgrade
description: >
    Upgrade notes.
weight: 10
---

Normally the upgrade procedure looks like that:
1) pick the release to upgrade
2) check the release notes/changelog between the release you use currently and the target release
3) sometimes you may need to change some configuration settings to change the defaults (for better compatibility, etc)
4) upgrade itself is simple:
   * upgrade package (it doesn't trigger the restart of clickhouse-server automatically)
   * restart clickhouse-server
   * check healthchecks / logs
   * repeat on other nodes
6) Mixing several versions working together in the same cluster may often lead to different degradations. Usually, it's not recommended to have a big delay between upgrading different nodes on the same cluster. Usually, you do upgrade on the odd replicas first, and after they were back online - restart the even replicas.
7) upgrade the dev / staging first
8) ensure your schema/queries work properly on the staging env
9) do the production upgrade.
