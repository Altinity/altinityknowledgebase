---
title: "Hardware Requirements"
linkTitle: "Hardware Requirements"
description: >
    Hardware Requirements
---
### ClickHouse®

ClickHouse will use all available hardware to maximize performance. So the more hardware - the better. As of this publication, the hardware requirements are:

* Minimum Hardware: 4-core CPU with support of SSE4.2, 16 Gb RAM, 1Tb HDD.
  * Recommended for development and staging environments.
  * SSE4.2 is required, and going below 4 Gb of RAM is not recommended.
* Recommended Hardware: >=16-cores, >=64Gb RAM, HDD-raid or SSD.
  * For processing up to hundreds of millions / billions of rows.

For clouds: disk throughput is the more important factor compared to IOPS. Be aware of burst / baseline disk speed difference.

See also: [https://benchmark.clickhouse.com/hardware/](https://benchmark.clickhouse.com/hardware/)

### **Zookeeper**

Zookeeper requires separate servers from those used for ClickHouse. Zookeeper has poor performance when installed on the same node as ClickHouse.

Hardware Requirements for Zookeeper:

* Fast disk speed (ideally NVMe, 128Gb should be enough).
* Any modern CPU (one core, better 2)
* 4Gb of RAM

For clouds - be careful with burstable network disks (like gp2 on aws): you may need up to 1000 IOPs on the disk for on a long run, so gp3 with 3000 IOPs baseline is a better choice.

The number of Zookeeper instances depends on the environment:

* Production: 3 is an optimal number of zookeeper instances.
* Development and Staging: 1 zookeeper instance is sufficient.

See also:

* [https://docs.altinity.com/operationsguide/clickhouse-zookeeper/](https://docs.altinity.com/operationsguide/clickhouse-zookeeper/)
* [altinity-kb-proper-setup]({{<ref "altinity-kb-proper-setup" >}})
* [zookeeper-monitoring]({{<ref "zookeeper-monitoring" >}})

#### ClickHouse Hardware Configuration

Configure the servers according to those recommendations the [ClickHouse Usage Recommendations](https://clickhouse.yandex/docs/en/operations/tips/).

#### **Test Your Hardware**

Be sure to test the following:

* RAM speed.
* Network speed.
* Storage speed.

It’s better to find any performance issues before installing ClickHouse.
