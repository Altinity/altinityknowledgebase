---
title: "ClickHouse Monitoring"
linkTitle: "ClickHouse Monitoring"
description: >
    ClickHouse Monitoring
---

## ClickHouse Monitoring

Monitoring helps to track potential issues in your cluster before they cause a critical error.

What to read / watch on subject:
* Altinity webinar "ClickHouse Monitoring 101: What to monitor and how". [recording](https://www.youtube.com/watch?v=W9KlehhgwLw), [slides](https://www.slideshare.net/Altinity/clickhouse-monitoring-101-what-to-monitor-and-how)
* docs https://clickhouse.com/docs/en/operations/monitoring/ 

## What should be monitored

The following metrics should be collected / monitored

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
  * [See separate article](../altinity-kb-zookeeper/zookeeper-monitoring.md)


## Monitoring tools

### Prometheus (embedded exporter) + Grafana

* Enable [embedded exporter](https://clickhouse.com/docs/en/operations/server-configuration-parameters/settings/#server_configuration_parameters-prometheus)
* Grafana dashboards [https://grafana.com/grafana/dashboards/14192](https://grafana.com/grafana/dashboards/14192) or [https://grafana.com/grafana/dashboards/13500](https://grafana.com/grafana/dashboards/13500)

### clickhouse-operator embedded exporter

* exporter is included in clickhouse-operator, and enabled automatically
* see instructions of [Prometheus](https://github.com/Altinity/clickhouse-operator/blob/eb3fc4e28514d0d6ea25a40698205b02949bcf9d/docs/prometheus_setup.md) and [Grafana](https://github.com/Altinity/clickhouse-operator/blob/eb3fc4e28514d0d6ea25a40698205b02949bcf9d/docs/grafana_setup.md) installation (if you don't have one)
* Grafana dashboard [https://github.com/Altinity/clickhouse-operator/tree/master/grafana-dashboard](https://github.com/Altinity/clickhouse-operator/tree/master/grafana-dashboard)
* Prometheus alerts [https://github.com/Altinity/clickhouse-operator/blob/master/deploy/prometheus/prometheus-alert-rules-clickhouse.yaml](https://github.com/Altinity/clickhouse-operator/blob/master/deploy/prometheus/prometheus-alert-rules-clickhouse.yaml)

### Prometheus exporter (external) + Grafana

* [clickhouse-exporter](https://github.com/ClickHouse/clickhouse_exporter)
* Dashboard: https://grafana.com/grafana/dashboards/882 

(unmaintained)

### Dashboards quering clickhouse directly

* Overview: [https://grafana.com/grafana/dashboards/13606](https://grafana.com/grafana/dashboards/13606)
* Queries dashboard (analyzing system.query_log) https://grafana.com/grafana/dashboards/2515

### Zabbix

* https://www.zabbix.com/integrations/clickhouse
* https://github.com/Altinity/clickhouse-zabbix-template

### Graphite

* Use the embedded exporter. See [docs](https://clickhouse.com/docs/en/operations/server-configuration-parameters/settings/#server_configuration_parameters-graphite) and config.xml

### InfluxDB

* You can use embedded exporter, plus Telegraf. For more information, see [Graphite protocol support in InfluxDB](https://docs.influxdata.com/influxdb/v1.7/supported_protocols/graphite/).

### Nagios/Icinga 

* https://github.com/exogroup/check_clickhouse/

### Commercial solution

* Datadog https://docs.datadoghq.com/integrations/clickhouse/?tab=host 
* Sematext https://sematext.com/docs/integration/clickhouse/ 
* Instana https://www.instana.com/supported-technologies/clickhouse-monitoring/
* site24x7 https://www.site24x7.com/plugins/clickhouse-monitoring.html
* Acceldata Pulse https://www.acceldata.io/blog/acceldata-pulse-for-clickhouse-monitoring

### "Build your own" monitoring

ClickHouse allow to access lot of internals using system tables. The main tables to access monitoring data are:
* system.metrics
* system.asynchronous_metrics
* system.events

Minimum neccessary set of checks

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

The following queries are recommended to be included in monitoring:

* `SELECT * FROM system.replicas`
  * For more information, see the ClickHouse guide on [System Tables](https://clickhouse.tech/docs/en/operations/system_tables/#system_tables-replicas)
* `SELECT * FROM system.merges`
  * Checks on the speed and progress of currently executed merges.
* `SELECT * FROM system.mutations`
  * This is the source of information on the speed and progress of currently executed merges.

## Logs monitoring

ClickHouse logs can be another important source of information. There are 2 logs enabled by default
* /var/log/clickhouse-server/clickhouse-server.err.log (error & warning, you may want to keep an eye on that or send it to some monitoring system)
* /var/log/clickhouse-server/clickhouse-server.log (trace logs,  very detailed, useful for debugging, usually too verbose to monitor).

You can additionally enable system.text_log table to have an access to the logs from clickhouse sql queries (ensure that you will not expose some information to the users which should not see it).

## OpenTelemetry support

See https://clickhouse.com/docs/en/operations/opentelemetry/

## Other sources

* [https://tech.marksblogg.com/clickhouse-prometheus-grafana.html](https://tech.marksblogg.com/clickhouse-prometheus-grafana.html)
* [Key Metrics for Monitoring ClickHouse](https://sematext.com/blog/clickhouse-monitoring-key-metrics/)
* [ClickHouse Monitoring Key Metrics to Monitor](https://dzone.com/articles/clickhouse-monitoring-key-metrics-to-monitor-semat)
* [ClickHouse Monitoring Tools: Five Tools to Consider](https://dzone.com/articles/clickhouse-monitoring-tools-five-tools-to-consider)
* [Monitoring ClickHouse](https://docs.instana.io/ecosystem/clickhouse/)
* [Monitor ClickHouse with Datadog](https://www.datadoghq.com/blog/monitor-clickhouse/)
* [Unsorted notes on monitor and Alerts](https://docs.google.com/spreadsheets/d/1K92yZr5slVQEvDglfZ88k_7bfsAKqahY9RPp_2tSdVU/edit#gid=521173956)
* https://intl.cloud.tencent.com/document/product/1026/36887
* https://chowdera.com/2021/03/20210301161806704Y.html
* https://chowdera.com/2021/03/20210301160252465m.html#
