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
  * Network \(bytes/packets\)
  * Storage \(iops\)
  * Disk Space \(free / used\)
* For ClickHouse:
  * Connections \(count\)
  * RWLocks
  * Read / Write / Return \(bytes\)
  * Read / Write / Return \(rows\)
  * Zookeeper operations \(count\)
  * Absolute delay
  * Query duration \(optional\)
  * Replication parts and queue \(count\)
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

* [Monitor and Alerts](http://localhost:1313/csv/clickhouse_kubernetes_monitoring_and_alerts.csv)

#### Health Checks

The following health checks should be monitored:

<table>
  <thead>
    <tr>
      <th style="text-align:left">Check Name</th>
      <th style="text-align:left">Shell or SQL command</th>
      <th style="text-align:left">Severity</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="text-align:left">ClickHouse status</td>
      <td style="text-align:left">$ curl &apos;http://localhost:8123/&apos;Ok.</td>
      <td style="text-align:left">Critical</td>
    </tr>
    <tr>
      <td style="text-align:left">Too many simultaneous queries. Maximum: 100</td>
      <td style="text-align:left">select value from system.metrics where metric=&apos;Query&apos;</td>
      <td
      style="text-align:left">Critical</td>
    </tr>
    <tr>
      <td style="text-align:left">Replication status</td>
      <td style="text-align:left">$ curl &apos;http://localhost:8123/replicas_status&apos;Ok.</td>
      <td style="text-align:left">High</td>
    </tr>
    <tr>
      <td style="text-align:left">Read only replicas (reflected by replicas_status as well)</td>
      <td style="text-align:left">select value from system.metrics where metric=&apos;ReadonlyReplica&#x2019;</td>
      <td
      style="text-align:left">High</td>
    </tr>
    <tr>
      <td style="text-align:left">ReplicaPartialShutdown (not reflected by replicas_status, but seems to
        correlate with ZooKeeperHardwareExceptions)</td>
      <td style="text-align:left">select value from system.events where event=&apos;ReplicaPartialShutdown&apos;</td>
      <td
      style="text-align:left">HighI turned this one off. It almost always correlates with ZooKeeperHardwareExceptions,
        and when it&#x2019;s not, then there is nothing bad happening&#x2026;</td>
    </tr>
    <tr>
      <td style="text-align:left">Some replication tasks are stuck</td>
      <td style="text-align:left">select count()from system.replication_queuewhere num_tries &gt; 100</td>
      <td
      style="text-align:left">High</td>
    </tr>
    <tr>
      <td style="text-align:left">ZooKeeper is available</td>
      <td style="text-align:left">select count() from system.zookeeper where path=&apos;/&apos;</td>
      <td
      style="text-align:left">Critical for writes</td>
    </tr>
    <tr>
      <td style="text-align:left">ZooKeeper exceptions</td>
      <td style="text-align:left">select value from system.events where event=&apos;ZooKeeperHardwareExceptions&apos;</td>
      <td
      style="text-align:left">Medium</td>
    </tr>
    <tr>
      <td style="text-align:left">Other CH nodes are available</td>
      <td style="text-align:left">$ for node in `echo &quot;select distinct host_address from system.clusters
        where host_name !=&apos;localhost&apos;&quot;</td>
      <td style="text-align:left">curl &apos;http://localhost:8123/&apos; &#x2013;silent &#x2013;data-binary
        @-`; do curl &quot;http://$node:8123/&quot; &#x2013;silent ; done</td>
    </tr>
    <tr>
      <td style="text-align:left">All CH clusters are available (i.e. every configured cluster has enough
        replicas to serve queries)</td>
      <td style="text-align:left">for cluster in `echo &quot;select distinct cluster from system.clusters
        where host_name !=&apos;localhost&apos;&quot;</td>
      <td style="text-align:left">curl &apos;http://localhost:8123/&apos; &#x2013;silent &#x2013;data-binary
        @-` ; do clickhouse-client &#x2013;query=&quot;select &apos;$cluster&apos;,
        &apos;OK&apos; from cluster(&apos;$cluster&apos;, system, one)&quot; ;
        done</td>
    </tr>
    <tr>
      <td style="text-align:left">There are files in &apos;detached&apos; folders</td>
      <td style="text-align:left">$ find /var/lib/clickhouse/data///detached/* -type d</td>
      <td style="text-align:left">
        <p>wc -l;</p>
        <p>19.8+select count() from system.detached_parts</p>
      </td>
    </tr>
    <tr>
      <td style="text-align:left">
        <p>Too many parts:</p>
        <p>Number of parts is growing;</p>
        <p>Inserts are being delayed;</p>
        <p>Inserts are being rejected</p>
      </td>
      <td style="text-align:left">
        <p>select value from system.asynchronous_metrics where metric=&apos;MaxPartCountForPartition&apos;;select
          value from system.events/system.metrics where event/metric=&apos;DelayedInserts&apos;;</p>
        <p>select value from system.events where event=&apos;RejectedInserts&apos;</p>
      </td>
      <td style="text-align:left">Critical</td>
    </tr>
    <tr>
      <td style="text-align:left">Dictionaries: exception</td>
      <td style="text-align:left">select concat(name,&apos;: &apos;,last_exception) from system.dictionarieswhere
        last_exception != &apos;&apos;</td>
      <td style="text-align:left">Medium</td>
    </tr>
    <tr>
      <td style="text-align:left">ClickHouse has been restarted</td>
      <td style="text-align:left">select uptime();select value from system.asynchronous_metrics where metric=&apos;Uptime&apos;</td>
      <td
      style="text-align:left"></td>
    </tr>
    <tr>
      <td style="text-align:left">DistributedFilesToInsert should not be always increasing</td>
      <td style="text-align:left">select value from system.metrics where metric=&apos;DistributedFilesToInsert&apos;</td>
      <td
      style="text-align:left">Medium</td>
    </tr>
    <tr>
      <td style="text-align:left">A data part was lost</td>
      <td style="text-align:left">select value from system.events where event=&apos;ReplicatedDataLoss&apos;</td>
      <td
      style="text-align:left">High</td>
    </tr>
    <tr>
      <td style="text-align:left">Data parts are not the same on different replicas</td>
      <td style="text-align:left">
        <p>select value from system.events where event=&apos;DataAfterMergeDiffersFromReplica&apos;;</p>
        <p>select value from system.events where event=&apos;DataAfterMutationDiffersFromReplica&apos;</p>
      </td>
      <td style="text-align:left">Medium</td>
    </tr>
  </tbody>
</table>

#### Monitoring References

* [https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-monitoring](https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-monitoring)
* [https://tech.marksblogg.com/clickhouse-prometheus-grafana.html](https://tech.marksblogg.com/clickhouse-prometheus-grafana.html)
* [Key Metrics for Monitoring ClickHouse](https://sematext.com/blog/clickhouse-monitoring-key-metrics/)
* [ClickHouse Monitoring Key Metrics to Monitor](https://dzone.com/articles/clickhouse-monitoring-key-metrics-to-monitor-semat)
* [ClickHouse Monitoring Tools: Five Tools to Consider](https://dzone.com/articles/clickhouse-monitoring-tools-five-tools-to-consider)
* [Monitoring ClickHouse](https://docs.instana.io/ecosystem/clickhouse/)
* [Monitor ClickHouse with Datadog](https://www.datadoghq.com/blog/monitor-clickhouse/)

