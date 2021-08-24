---
title: "Data Migration"
linkTitle: "Data Migration"
description: >
    Data Migration
---
## Export & Import into common data formats

Pros and cons:
![(plus)](/assets/add.png) Data can be inserted into any DBMS.
![(minus)](/assets/forbidden.png) Decoding & encoding of common data formats may be slower / require more CPU
![(minus)](/assets/forbidden.png) The data size is usually bigger than ClickHouse formats.
![(minus)](/assets/forbidden.png) Some of the common data formats have limitations.

{{% alert title="Info" color="info" %}}
The best approach to do that is using clickhouse-client, in that case, encoding/decoding of format happens client-side, while client and server speak clickhouse Native format (columnar & compressed).

In contrast: when you use HTTP protocol, the server do encoding/decoding and more data is passed between client and server.
{{% /alert %}}

## remote/remoteSecure or cluster/Distributed table

Pros and cons:
![(plus)](/assets/add.png) Simple to run.
![(plus)](/assets/add.png) It’s possible to change the schema and distribution of data between shards.
![(plus)](/assets/add.png) It’s possible to copy only some subset of data
![(plus)](/assets/add.png) Needs only access to ClickHouse TCP port.
![(minus)](/assets/forbidden.png) Uses CPU / RAM (mostly on the receiver side)

See details in:

[remote-table-function.md]({{<ref "remote-table-function.md" >}})

## clickhouse-copier

Pros and cons:

![(plus)](/assets/add.png) Possible to do **some** changes schema.
![(plus)](/assets/add.png) Needs only access to ClickHouse TCP port.
![(plus)](/assets/add.png) It’s possible to change the distribution of data between shards.
![(plus)](/assets/add.png) Suitable for large clusters: many clickhouse-copier can execute the same task together.
![(minus)](/assets/forbidden.png) May create an inconsistent result if source cluster data is changing during the process
![(minus)](/assets/forbidden.png) Hard to setup.
![(minus)](/assets/forbidden.png) Requires zookeeper.
![(minus)](/assets/forbidden.png) Uses CPU / RAM (mostly on the clickhouse-copier and receiver side)

{{% alert title="Info" color="info" %}}
Internally it works like smart `INSERT INTO cluster(…) SELECT * FROM ...` with some consistency checks.
{{% /alert %}}

{{% alert title="Info" color="info" %}}
Run clickhouse copier on the same nodes as receiver clickhouse, to avoid doubling the network load.
{{% /alert %}}

See details in:

[altinity-kb-clickhouse-copier]({{<ref "altinity-kb-clickhouse-copier" >}})

## Manual parts moving: freeze / rsync / attach

Pros and cons:
![(plus)](/assets/add.png) Low CPU / RAM usage.
![(minus)](/assets/forbidden.png) Table schema should be the same.
![(minus)](/assets/forbidden.png) A lot of manual operations/scripting.

{{% alert title="Info" color="info" %}}
With some additional care and scripting, it’s possible to do cheap re-sharding on parts level.
{{% /alert %}}

See details in:

[rsync.md]({{<ref "rsync.md" >}})

## clickhouse-backup

Pros and cons:
![(plus)](/assets/add.png) Low CPU / RAM usage.
![(plus)](/assets/add.png) Suitable to recover both schema & data for all tables at once.
![(minus)](/assets/forbidden.png) Table schema should be the same.

Just create the backup on server 1, upload it to server 2, and restore the backup.

See [https://github.com/AlexAkulov/clickhouse-backup](https://github.com/AlexAkulov/clickhouse-backup)

[https://altinity.com/blog/introduction-to-clickhouse-backups-and-clickhouse-backup]("https://altinity.com/blog/introduction-to-clickhouse-backups-and-clickhouse-backup")

## Fetch from zookeeper path

Pros and cons:
![(plus)](/assets/add.png) Low CPU / RAM usage
![(minus)](/assets/forbidden.png) Table schema should be the same.
![(minus)](/assets/forbidden.png) Works only when the source and the destination clickhouse servers share the same zookeeper (without chroot)
![(minus)](/assets/forbidden.png) Needs to access zookeeper and ClickHouse replication ports: (`interserver_http_port` or `interserver_https_port`)

```sql
ALTER TABLE table_name FETCH PARTITION partition_expr FROM 'path-in-zookeeper'
```

## Replication protocol

Just make one more replica in another place.

Pros and cons:
![(plus)](/assets/add.png) Simple to setup
![(plus)](/assets/add.png) Data is consistent all the time automatically.
![(plus)](/assets/add.png) Low CPU and network usage.
![(minus)](/assets/forbidden.png) Needs to reach both zookeeper client (2181) and ClickHouse replication ports: (`interserver_http_port` or `interserver_https_port`)
![(minus)](/assets/forbidden.png) In case of cluster migration, zookeeper need’s to be migrated too.
![(minus)](/assets/forbidden.png) Replication works both ways.

[../altinity-kb-zookeeper/altinity-kb-zookeeper-cluster-migration.md](../altinity-kb-zookeeper/altinity-kb-zookeeper-cluster-migration.md)

## See also

### Github issues

[https://github.com/ClickHouse/ClickHouse/issues/10943](https://github.com/ClickHouse/ClickHouse/issues/10943)
[https://github.com/ClickHouse/ClickHouse/issues/20219](https://github.com/ClickHouse/ClickHouse/issues/20219)
[https://github.com/ClickHouse/ClickHouse/pull/17871](https://github.com/ClickHouse/ClickHouse/pull/17871)

### Other links

[https://habr.com/ru/company/avito/blog/500678/](https://habr.com/ru/company/avito/blog/500678/)
