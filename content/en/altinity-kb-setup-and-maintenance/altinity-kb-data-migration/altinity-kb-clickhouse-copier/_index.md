---
title: "clickhouse-copier"
linkTitle: "clickhouse-copier"
description: >
    clickhouse-copier
---
The description of the utility and its parameters, as well as examples of the config files that you need to create for the copier are in the doc [https://clickhouse.tech/docs/en/operations/utilities/clickhouse-copier/](https://clickhouse.tech/docs/en/operations/utilities/clickhouse-copier/)

The steps to run a task:

1. Create a config file for clickhouse-copier (zookeeper.xml)

   [https://clickhouse.tech/docs/en/operations/utilities/clickhouse-copier/\#format-of-zookeeper-xml](https://clickhouse.tech/docs/en/operations/utilities/clickhouse-copier/#format-of-zookeeper-xml)

2. Create a config file for the task (task1.xml)

   [https://clickhouse.tech/docs/en/operations/utilities/clickhouse-copier/\#configuration-of-copying-tasks](https://clickhouse.tech/docs/en/operations/utilities/clickhouse-copier/#configuration-of-copying-tasks)

3. Create the task in ZooKeeper and start an instance of clickhouse-copier`clickhouse-copier --daemon --base-dir=/opt/clickhouse-copier --config /opt/clickhouse-copier/zookeeper.xml --task-path /clickhouse/copier/task1 --task-file /opt/clickhouse-copier/task1.xml`

If the node in ZooKeeper already exists and you want to change it, you need to add the `task-upload-force` parameter:

`clickhouse-copier --daemon --base-dir=/opt/clickhouse-copier --config /opt/clickhouse-copier/zookeeper.xml --task-path /clickhouse/copier/task1 --task-file /opt/clickhouse-copier/task1.xml --task-upload-force 1`

If you want to run another instance of clickhouse-copier for the same task, you need to copy the config file (zookeeper.xml) to another server, and run this command:

`clickhouse-copier --daemon --base-dir=/opt/clickhouse-copier --config /opt/clickhouse-copier/zookeeper.xml --task-path /clickhouse/copier/task1`

The number of simultaneously running instances is controlled be the `max_workers` parameter in your task configuration file. If you run more workers superfluous workers will sleep and log messages like this:

`<Debug> ClusterCopier: Too many workers (1, maximum 1). Postpone processing`

### See also

* https://clickhouse.tech/docs/en/operations/utilities/clickhouse-copier/
* Никита Михайлов. Кластер ClickHouse ctrl-с ctrl-v. HighLoad++ Весна 2021 [slides]( https://raw.githubusercontent.com/ClickHouse/clickhouse-presentations/master/highload2021/copier.pdf)
* 21.7 have a huge bulk of fixes / improvements. https://github.com/ClickHouse/ClickHouse/pull/23518
* https://altinity.com/blog/2018/8/22/clickhouse-copier-in-practice 
* http://www.clickhouse.com.cn/topic/601fb322b06e5e0f21ba79e1
* https://github.com/getsentry/snuba/blob/master/docs/clickhouse-copier.md
* https://hughsite.com/post/clickhouse-copier-usage.html
* https://www.jianshu.com/p/c058edd664a6
