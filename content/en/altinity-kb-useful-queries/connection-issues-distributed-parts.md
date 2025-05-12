---
title: "Notes on Various Errors with respect to replication and distributed connections"
linkTtitle: "Notes on Various Errors with respect to replication and distributed connections"
description: >
    Notes on errors related to replication and distributed connections
keywords: 
  - replication 
  - distributed connections
---
# Notes on Various Errors with respect to replication and distributed connections

## `ClickHouseDistributedConnectionExceptions`

This alert usually indicates that one of the nodes isn’t responding or that there’s an interconnectivity issue. Debug steps:

## 1. Check Cluster Connectivity
Verify connectivity inside the cluster by running: 
```
SELECT count() FROM clusterAllReplicas('{cluster}', cluster('{cluster}', system.one))
```

## 2. Check for Errors
Run the following queries to see if any nodes report errors: 

```
SELECT hostName(), * FROM clusterAllReplicas('{cluster}', system.clusters) WHERE errors_count > 0;
SELECT hostName(), * FROM clusterAllReplicas('{cluster}', system.errors) WHERE last_error_time > now() - 3600 ORDER BY value;
```

 Depending on the results, ensure that the affected node is up and responding to queries. Also, verify that connectivity (DNS, routes, delays) is functioning correctly.

### `ClickHouseReplicatedPartChecksFailed` & `ClickHouseReplicatedPartFailedFetches`

Unless you’re seeing huge numbers, these alerts can generally be ignored. They’re often a sign of temporary replication issues that ClickHouse resolves on its own. However, if the issue persists or increases rapidly, follow the steps to debug replication issues:

* Check the replication status using tables such as system.replicas and system.replication_queue.
* Examine server logs, system.errors, and system load for any clues.
* Try to restart the replica  (`SYSTEM RESTART REPLICA db_name.table_name` command) and, if necessary, contact Altinity support.
