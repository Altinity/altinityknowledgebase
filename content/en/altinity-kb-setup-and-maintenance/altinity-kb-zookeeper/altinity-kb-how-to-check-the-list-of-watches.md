---
title: "How to check the list of watches"
linkTitle: "How to check the list of watches"
description: >
    How to check the list of watches
---
Zookeeper use watches to notify a client on znode changes. This article explains how to check watches set by ZooKeeper servers and how it is used.

**Solution:**

Zookeeper uses the `'wchc'` command to list all watches set on the Zookeeper server.

`# echo wchc | nc zookeeper 2181`

Reference

[https://zookeeper.apache.org/doc/r3.4.12/zookeeperAdmin.html](https://zookeeper.apache.org/doc/r3.4.12/zookeeperAdmin.html)

The `wchp` and `wchc` commands are not enabled by default because of their known DOS vulnerability. For more information, see [ZOOKEEPER-2693](https://issues.apache.org/jira/browse/ZOOKEEPER-2693)and [Zookeeper 3.5.2 - Denial of Service](https://vulners.com/exploitdb/EDB-ID:41277).

By default those commands are disabled, they can be enabled via Java system property:

`-Dzookeeper.4lw.commands.whitelist=*`

on in zookeeper config: `4lw.commands.whitelist=*`\
