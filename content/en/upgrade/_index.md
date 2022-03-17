---
title: "Upgrade"
linkTitle: "Upgrade"
keywords:
- clickhouse upgrade
description: >
    Upgrade notes.
weight: 10
---

Normally the upgrade procedure look like that:
1) pick the release to upgrade
2) check the relase notes / changelog between the release you use currently and the targer release
3) sometimes you may need to change some configuration settings to change the defaults (for better compatibility, etc)
4) upgrade itself is simple:
   * upgrade package (it doesn't trigger the restart of clickhouse-server automatically)
   * restart clickhouse-server
   * check healthchecks / logs
   * repeat on other node
6) Mixing several versions workind together in the same cluster may often lead to different degradations. Usually it's not recommended to have a big delay between upgrading different nodes on the same cluster. Usually you do upgrade on the odd replicas first, and after they where back online - restart the even replicas.
7) upgrage the dev / staging first
8) ensure your schema / queries work properly on the staging env
9) do the production upgrade.
