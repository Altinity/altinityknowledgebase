---
title: "sysall database (system tables on a cluster level)"
linkTitle: "sysall database"
weight: 100
description: >-
     sysall database (system tables on a cluster level)
---

## Requirements

The idea is that you have a macros `cluster` with cluster name.

For example you have a cluster named `production` and this cluster includes all ClickHouse nodes.

```xml
$ cat /etc/clickhouse-server/config.d/clusters.xml
<?xml version="1.0" ?>
<yandex>
    <remote_servers>
        <production>
          <shard>
...
```

And you need to have a macro `cluster` set to `production`:
```
cat /etc/clickhouse-server/config.d/macros.xml
<?xml version="1.0" ?>
<yandex>
    <macros>
        <cluster>production</cluster>
        <replica>....</replica>
        ....
    </macros>
</yandex>
```

Now you should be able to query all nodes using `clusterAllReplicas`:

```sql
SELECT
    hostName(),
    FQDN(),
    materialize(uptime()) AS uptime
FROM clusterAllReplicas('{cluster}', system.one)
SETTINGS skip_unavailable_shards = 1

┌─hostName()─┬─FQDN()──────────────┬──uptime─┐
│ chhost1    │ chhost1.localdomain │ 1071574 │
│ chhost2    │ chhost2.localdomain │ 1071517 │
└────────────┴─────────────────────┴─────────┘
```

`skip_unavailable_shards` is necessary to query a system with some nodes are down.

## Script to create DB ojects

```sql
CREATE DATABASE sysall;

CREATE OR REPLACE VIEW sysall.cluster_state AS
SELECT
    shard_num,
    replica_num,
    host_name,
    host_address,
    port,
    errors_count,
    uptime,
    if(uptime > 0, 'UP', 'DOWN') AS node_state
FROM system.clusters
LEFT JOIN
(
    SELECT
        hostName() AS host_name,
        FQDN() AS fqdn,
        materialize(uptime()) AS uptime
    FROM clusterAllReplicas('{cluster}', system.one)
) as hosts_info USING (host_name)
WHERE cluster = getMacro('cluster')
SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.asynchronous_metrics as  select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.asynchronous_metrics) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.query_log as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.query_log) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.dictionaries as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.dictionaries) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.replication_queue as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.replication_queue) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.replicas as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.replicas) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.merges as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.merges) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.mutations as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.mutations) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.parts as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.parts) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.detached_parts as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.detached_parts) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.disks as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.disks) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.distribution_queue as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.distribution_queue) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.databases as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.databases) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.events as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.events) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.metrics as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.metrics) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.macros as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.macros) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.tables as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.tables) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.clusters as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.clusters) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.columns as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.columns) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.processes as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.processes) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.errors as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.errors) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.settings as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.settings) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.parts_columns as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.parts_columns) SETTINGS skip_unavailable_shards = 1;

CREATE OR REPLACE VIEW sysall.zookeeper as select hostName() nodeHost, FQDN() nodeFQDN, *
from clusterAllReplicas('{cluster}', system.zookeeper) SETTINGS skip_unavailable_shards = 1;
```

## Some examples 

```sql
select * from sysall.cluster_state;
┌─shard_num─┬─replica_num─┬─host_name───────────┬─host_address─┬─port─┬─errors_count─┬──uptime─┬─node_state─┐
│         1 │           1 │ chhost1.localdomain │ 10.253.86.2  │ 9000 │            0 │ 1071788 │ UP         │
│         2 │           1 │ chhost2.localdomain │ 10.253.215.2 │ 9000 │            0 │ 1071731 │ UP         │
│         3 │           1 │ chhost3.localdomain │ 10.252.83.8  │ 9999 │            0 │       0 │ DOWN       │
└───────────┴─────────────┴─────────────────────┴──────────────┴──────┴──────────────┴─────────┴────────────┘


SELECT
    nodeFQDN,
    path,
    formatReadableSize(free_space) AS free,
    formatReadableSize(total_space) AS total
FROM sysall.disks
┌─nodeFQDN────────────┬─path─────────────────┬─free───────┬─total──────┐
│ chhost1.localdomain │ /var/lib/clickhouse/ │ 511.04 GiB │ 937.54 GiB │
│ chhost2.localdomain │ /var/lib/clickhouse/ │ 495.77 GiB │ 937.54 GiB │
└─────────────────────┴──────────────────────┴────────────┴────────────┘

```
