---
title: "Monitoring Considerations"
linkTitle: "Monitoring Considerations"
description: >
    Monitoring Considerations
---


Monitoring helps to track potential issues in your cluster before they cause a critical error.

### External Monitoring

External monitoring collects data from the ClickHouse cluster and uses it for analysis and review.  Recommended external monitoring systems include:

* **Prometheus**: Use embedded exporter or [clickhouse-exporter](https://github.com/f1yegor/clickhouse_exporter)
* **Graphite**: Use the embedded exporter. See config.xml.
* **InfluxDB**: Use the embedded exporter, plus Telegraf. For more information, see [Graphite protocol support in InfluxDB](https://docs.influxdata.com/influxdb/v1.7/supported_protocols/graphite/).

ClickHouse can collect the recording of metrics internally by enabling `system.metric_log` in `config.xml`.

For dashboard system:

* [Grafana](https://grafana.com/) is recommended for graphs, reports, alerts, dashboard, etc.
* Other options are [Nagios](https://www.nagios.com/) or [Zabbix](https://www.zabbix.com/).

The following metrics should be collected:

* For Host Machine:
  * CPU
  * Memory
  * Network (bytes/packets)
  * Storage (iops)
  * Disk Space (free / used)
* For ClickHouse:
  * Connections (count)
  * RWLocks
  * Read / Write / Return (bytes)
  * Read / Write / Return (rows)
  * Zookeeper operations (count)
  * Absolute delay
  * Query duration (optional)
  * Replication parts and queue (count)
* For Zookeeper:
  * See [ZooKeeper Monitoring Integration](https://sematext.com/docs/integration/zookeeper/).

The following queries are recommended to be included in monitoring:

* SELECT \* FROM system.replicas
  * For more information, see the ClickHouse guide on [System Tables](https://clickhouse.tech/docs/en/operations/system_tables/#system_tables-replicas)
* SELECT \* FROM system.merges
  * Checks on the speed and progress of currently executed merges.
* SELECT \* FROM system.mutations
  * This is the source of information on the speed and progress of currently executed merges.

### Monitor and Alerts

Configure the notifications for events and thresholds based on the following table:

* [Monitor and Alerts](https://docs.google.com/spreadsheets/d/1K92yZr5slVQEvDglfZ88k_7bfsAKqahY9RPp_2tSdVU/edit#gid=521173956)

#### Health Checks

The following health checks should be monitored:

<table>
  <tr>
   <td><strong>Check Name</strong>
   </td>
   <td><strong><code>Shell or SQL command</code></strong>
   </td>
   <td><strong><code>Severity</code></strong>
   </td>
  </tr>
  <tr>
   <td>ClickHouse status
   </td>
   <td><code>$ curl 'http://localhost:8123/'</code>
<p>
<code>Ok.</code>
   </td>
   <td><code>Critical</code>
   </td>
  </tr>
  <tr>
   <td>Too many simultaneous queries. Maximum: 100 (by default)
   </td>
   <td><code>select value from system.metrics </code>
<p>
<code>where metric='Query'</code>
   </td>
   <td><code>Critical</code>
   </td>
  </tr>
  <tr>
   <td>Replication status
   </td>
   <td><code>$ curl 'http://localhost:8123/replicas_status'</code>
<p>
<code>Ok.</code>
   </td>
   <td><code>High</code>
   </td>
  </tr>
  <tr>
   <td>Read only replicas (reflected by <code>replicas_status</code> as well)
   </td>
   <td><code>select value from system.metrics </code>
<p>
<code>where metric='ReadonlyReplica'</code>
   </td>
   <td><code>High</code>
   </td>
  </tr>
  <tr>
   <td>Some replication tasks are stuck
   </td>
   <td><code>select count()</code>
<p>
<code>from system.replication_queue</code>
<p>
<code>where num_tries > 100 or num_postponed > 1000</code>
   </td>
   <td><code>High</code>
   </td>
  </tr>
  <tr>
   <td>ZooKeeper is available
   </td>
   <td><code>select count() from system.zookeeper </code>
<p>
<code>where path='/'</code>
   </td>
   <td><code>Critical for writes</code>
   </td>
  </tr>
  <tr>
   <td>ZooKeeper exceptions
   </td>
   <td><code>select value from system.events </code>
<p>
<code>where event='ZooKeeperHardwareExceptions'</code>
   </td>
   <td><code>Medium</code>
   </td>
  </tr>
  <tr>
   <td>Other CH nodes are available
   </td>
   <td><code>$ for node in `echo "select distinct host_address from system.clusters where host_name !='localhost'" | curl 'http://localhost:8123/' --silent --data-binary @-`; do curl "http://$node:8123/" --silent ; done | sort -u</code>
<p>
<code>Ok.</code>
   </td>
   <td><code>High</code>
   </td>
  </tr>
  <tr>
   <td>All CH clusters are available (i.e. every configured cluster has enough replicas to serve queries)
   </td>
   <td><code>for cluster in `echo "select distinct cluster from system.clusters where host_name !='localhost'" | curl 'http://localhost:8123/' --silent --data-binary @-` ; do clickhouse-client --query="select '$cluster', 'OK' from cluster('$cluster', system, one)" ; done </code>
   </td>
   <td><code>Critical</code>
   </td>
  </tr>
  <tr>
   <td>There are files in 'detached' folders
   </td>
   <td><code>$ find /var/lib/clickhouse/data/*/*/detached/* -type d | wc -l; \
19.8+</code>
<p>
<code>select count() from system.detached_parts</code>
   </td>
   <td><code>Medium</code>
   </td>
  </tr>
  <tr>
   <td>Too many parts: \
Number of parts is growing; \
Inserts are being delayed; \
Inserts are being rejected
   </td>
   <td><code>select value from system.asynchronous_metrics </code>
<p>
<code>where metric='MaxPartCountForPartition';</code>
<p>
<code>select value from system.events/system.metrics </code>
<p>
<code>where event/metric='DelayedInserts'; \
select value from system.events </code>
<p>
<code>where event='RejectedInserts'</code>
   </td>
   <td><code>Critical</code>
   </td>
  </tr>
  <tr>
   <td>Dictionaries: exception
   </td>
   <td><code>select concat(name,': ',last_exception) </code>
<p>
<code>from system.dictionaries</code>
<p>
<code>where last_exception != ''</code>
   </td>
   <td><code>Medium</code>
   </td>
  </tr>
  <tr>
   <td>ClickHouse has been restarted
   </td>
   <td><code>select uptime();</code>
<p>
<code>select value from system.asynchronous_metrics </code>
<p>
<code>where metric='Uptime'</code>
   </td>
   <td>
   </td>
  </tr>
  <tr>
   <td>DistributedFilesToInsert should not be always increasing
   </td>
   <td><code>select value from system.metrics </code>
<p>
<code>where metric='DistributedFilesToInsert'</code>
   </td>
   <td><code>Medium</code>
   </td>
  </tr>
  <tr>
   <td>A data part was lost
   </td>
   <td><code>select value from system.events </code>
<p>
<code>where event='ReplicatedDataLoss'</code>
   </td>
   <td><code>High</code>
   </td>
  </tr>
  <tr>
   <td>Data parts are not the same on different replicas
   </td>
   <td><code>select value from system.events where event='DataAfterMergeDiffersFromReplica'; \
select value from system.events where event='DataAfterMutationDiffersFromReplica'</code>
   </td>
   <td><code>Medium</code>
   </td>
  </tr>
  <tr>
   <td>
   </td>
   <td>
   </td>
   <td>
   </td>
  </tr>
</table>

#### Monitoring References

* [altinity-kb-monitoring]({{<ref "altinity-kb-monitoring" >}})
* [https://tech.marksblogg.com/clickhouse-prometheus-grafana.html](https://tech.marksblogg.com/clickhouse-prometheus-grafana.html)
* [Key Metrics for Monitoring ClickHouse](https://sematext.com/blog/clickhouse-monitoring-key-metrics/)
* [ClickHouse Monitoring Key Metrics to Monitor](https://dzone.com/articles/clickhouse-monitoring-key-metrics-to-monitor-semat)
* [ClickHouse Monitoring Tools: Five Tools to Consider](https://dzone.com/articles/clickhouse-monitoring-tools-five-tools-to-consider)
* [Monitoring ClickHouse](https://docs.instana.io/ecosystem/clickhouse/)
* [Monitor ClickHouse with Datadog](https://www.datadoghq.com/blog/monitor-clickhouse/)
