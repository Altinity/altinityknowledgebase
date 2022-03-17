---
title: "Vulnerabilities"
linkTitle: "Vulnerabilities"
weight: 100
description: >-
     Vulnerabilities
---

## 2022-03-15: 7 vulnerabulities in ClickHouse were published.

See the details https://jfrog.com/blog/7-rce-and-dos-vulnerabilities-found-in-clickhouse-dbms/

Those vulnerabilities were fixed by 2 PRs:

* https://github.com/ClickHouse/ClickHouse/pull/27136
* https://github.com/ClickHouse/ClickHouse/pull/27743

All releases starting from v21.10.2.15 have that problem fixed.

Also, the fix was backported to 21.3 and 21.8 branches - versions v21.8.11.4-lts and v21.3.19.1-lts
accordingly have the problem fixed (and all newer releases in those branches).

The latest Altinity stable releases also contain the bugfix.

* [21.8.13](https://docs.altinity.com/releasenotes/altinity-stable-release-notes/21.8/21813/)
* [21.3.20](https://docs.altinity.com/releasenotes/altinity-stable-release-notes/21.3/21320/)

If you use some older version we recommend upgrading.

Before the upgrade - please ensure that ports 9000 and 8123 are not exposed to the internet, so external
clients who can try to exploit those vulnerabilities can not access your clickhouse node.
