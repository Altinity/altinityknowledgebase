---
title: "JVM sizes and garbage collector settings"
linkTitle: "JVM sizes and garbage collector settings"
description: >
    JVM sizes and garbage collector settings
---
## TLDR version

use fresh Java version (11 or newer), disable swap and set up (for 4 Gb node):

```bash
JAVA_OPTS="-Xms512m -Xmx3G -XX:+AlwaysPreTouch -Djute.maxbuffer=8388608 -XX:MaxGCPauseMillis=50"
```

If you have a node with more RAM - change it accordingly, for example for 8Gb node:

```bash
JAVA_OPTS="-Xms512m -Xmx7G -XX:+AlwaysPreTouch -Djute.maxbuffer=8388608 -XX:MaxGCPauseMillis=50"
```

## Details

1. ZooKeeper runs as in JVM. Depending on version different garbage collectors are available.

1. Recent JVM versions (starting from 10) use `G1` garbage collector by default (should work fine).
On JVM 13-14 using `ZGC` or `Shenandoah` garbage collector may reduce pauses.
On older JVM version (before 10) you may want to make some tuning to decrease pauses, ParNew + CMS garbage collectors (like in Yandex config) is one of the best options.

1. One of the most important setting for JVM application is heap size. A heap size of >1 GB is recommended for most use cases and monitoring heap usage to ensure no delays are caused by garbage collection. We recommend to use at least 4Gb of RAM for zookeeper nodes (8Gb is better, that will make difference only when zookeeper is heavily loaded).

Set the Java heap size smaller than available RAM size on the node. This is very important to avoid swapping, which will seriously degrade ZooKeeper performance. Be conservative - use a maximum heap size of 3GB for a 4GB machine.

1. Add `XX:+AlwaysPreTouch` flag as well to load the memory pages into memory at the start of the zookeeper.

1. Set min (`Xms`) heap size to the values like 512Mb, or even to the same value as max (`Xmx`) to avoid resizing and returning the RAM to OS. Add `XX:+AlwaysPreTouch` flag as well to load the memory pages into memory at the start of the zookeeper.

1. `MaxGCPauseMillis=50` (by default 200) - the 'target' acceptable pause for garbage collection (milliseconds)

1. `jute.maxbuffer` limits the maximum size of znode content. By default it's 1Mb. In some usecases (lot of partitions in table) ClickHouse may need to create bigger znodes.

1. (optional) enable GC logs: `-Xloggc:/path_to/gc.log`



## Zookeeper configurarion used by Yandex Metrika (from 2017)

The configuration used by Yandex ( [https://clickhouse.tech/docs/en/operations/tips/\#zookeeper](https://clickhouse.tech/docs/en/operations/tips/#zookeeper) ) - they use older JVM version (with `UseParNewGC` garbage collector), and tune GC logs heavily:

```bash
JAVA_OPTS="-Xms{{ cluster.get('xms','128M') }} \
    -Xmx{{ cluster.get('xmx','1G') }} \
    -Xloggc:/var/log/$NAME/zookeeper-gc.log \
    -XX:+UseGCLogFileRotation \
    -XX:NumberOfGCLogFiles=16 \
    -XX:GCLogFileSize=16M \
    -verbose:gc \
    -XX:+PrintGCTimeStamps \
    -XX:+PrintGCDateStamps \
    -XX:+PrintGCDetails
    -XX:+PrintTenuringDistribution \
    -XX:+PrintGCApplicationStoppedTime \
    -XX:+PrintGCApplicationConcurrentTime \
    -XX:+PrintSafepointStatistics \
    -XX:+UseParNewGC \
    -XX:+UseConcMarkSweepGC \
    -XX:+CMSParallelRemarkEnabled"
```

## See also

* [https://wikitech.wikimedia.org/wiki/JVM_Tuning\#G1_for_full_gcs](https://wikitech.wikimedia.org/wiki/JVM_Tuning#G1_for_full_gcs)
* [https://sematext.com/blog/java-garbage-collection-tuning/](https://sematext.com/blog/java-garbage-collection-tuning/)
* [https://www.oracle.com/technical-resources/articles/java/g1gc.html](https://www.oracle.com/technical-resources/articles/java/g1gc.html)
* [https://docs.oracle.com/cd/E40972_01/doc.70/e40973/cnf_jvmgc.htm\#autoId2](https://docs.oracle.com/cd/E40972_01/doc.70/e40973/cnf_jvmgc.htm#autoId2)
* [https://docs.cloudera.com/runtime/7.2.7/kafka-performance-tuning/topics/kafka-tune-broker-tuning-jvm.html](https://docs.cloudera.com/runtime/7.2.7/kafka-performance-tuning/topics/kafka-tune-broker-tuning-jvm.html)
* [https://docs.cloudera.com/documentation/enterprise/6/6.3/topics/cm-tune-g1gc.html](https://docs.cloudera.com/documentation/enterprise/6/6.3/topics/cm-tune-g1gc.html)
* [https://blog.sokolenko.me/2014/11/javavm-options-production.html](https://blog.sokolenko.me/2014/11/javavm-options-production.html)
* [https://www.maknesium.de/21-most-important-java-8-vm-options-for-servers](https://www.maknesium.de/21-most-important-java-8-vm-options-for-servers)
* [https://docs.oracle.com/javase/10/gctuning/introduction-garbage-collection-tuning.htm\#JSGCT-GUID-326EB4CF-8C8C-4267-8355-21AB04F0D304](https://docs.oracle.com/javase/10/gctuning/introduction-garbage-collection-tuning.htm#JSGCT-GUID-326EB4CF-8C8C-4267-8355-21AB04F0D304)
* [https://github.com/chewiebug/GCViewer](https://github.com/chewiebug/GCViewer)
