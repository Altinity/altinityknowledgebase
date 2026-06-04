---
title: "ClickHouse® Monitoring"
linkTitle: "ClickHouse® Monitoring"
description: >
    Tracking potential issues in your cluster before they cause a critical error
keywords: 
  - ClickHouse® monitoring
  - ClickHouse® metrics
---

What to read / watch on the subject:
* Altinity webinar "ClickHouse® Monitoring 101: What to monitor and how". [Watch the video](https://www.youtube.com/watch?v=W9KlehhgwLw) or [download the slides](https://www.slideshare.net/Altinity/clickhouse-monitoring-101-what-to-monitor-and-how).
* [The ClickHouse® docs](https://clickhouse.com/docs/en/operations/monitoring/)

## What should be monitored

The following metrics should be collected / monitored

* For Host Machine:
  * CPU: saturation, load average, and iowait
  * Memory: pressure and available memory
  * Network: throughput, packets, errors, and drops
  * Storage: latency, throughput, IOPS, and queue depth
  * Disk Space: free / used

* For ClickHouse:
  * Query workload:
    * Connections and number of queries running
    * Query rate, query duration, and long-running queries
    * Read / Write / Return (bytes/rows)
    * Query read amplification: selected rows / bytes / marks / ranges / parts
  * Memory / cache / contention:
    * Cache hit rates: mark cache, query cache, and page / filesystem cache if used
  * Parts / background work:
    * Merges (queue length, memory used)
    * Mutations
    * Part growth, max parts per partition, and detached parts
  * Replication / distributed execution:
    * Replication queue length, lag, and failed fetch / check events
    * Read-only replicas
    * Keeper / ZooKeeper wait time on the ClickHouse® side
    * Keeper / ZooKeeper client metrics on the ClickHouse® side: in-flight requests, sessions / watches, operation rates by type, init / close churn, and exceptions
    * DDL queue length and Distributed tables backlog
  * Optional integrations:
    * S3 errors and remote-disk latency (if used)
    * Kafka consumer health (if used)

* For ClickHouse® Keeper (if used):
  * Quorum / leader election stability, leader churn, and quorum uptime
  * Follower / observer sync, proposal size, and proposal / ack / commit / propagation latency
  * Outstanding requests and backlog in prep / sync / commit / final processing queues
  * Sessions, connection rejects / drops, and watch growth if your workload uses watches heavily
  * Fsync time / rate, snapshot time, open file descriptors, and other disk-pressure signals
  * TLS handshake or ensemble-auth failures if enabled
  * [See also clickhouse-keeper](../altinity-kb-zookeeper/clickhouse-keeper/)

* For ZooKeeper (if used):
  * Session health, outstanding requests, connection churn, and watch counts
  * Znode count / growth and approximate data size
  * Packets sent / received, leader election, quorum uptime, follower sync time, and request latency
  * Snapshot / fsync pressure, unrecoverable errors, and digest mismatches
  * JVM heap / GC / pause and thread health
  * [See separate article](../altinity-kb-zookeeper/zookeeper-monitoring/)


## ClickHouse® monitoring tools

### ClickHouse® internal dashboards

Built-in ClickHouse® web dashboards are useful for local troubleshooting and ad hoc checks. Do not treat them as a replacement for production monitoring, alerting, retention, or access-control design. Do not expose these endpoints publicly.

* Advanced dashboard: `http://localhost:8123/dashboard`. Current ClickHouse® docs describe it as a built-in dashboard for query rate, CPU, merges, reads, memory, inserts, and part counts. It is backed by rows from [`system.dashboards`](https://clickhouse.com/docs/operations/system-tables/dashboards) and mostly charts history from `system.metric_log` and `system.asynchronous_metric_log`; if those logs are disabled or empty, many graphs will be empty. See the upstream [monitoring docs](https://clickhouse.com/docs/operations/monitoring#built-in-advanced-observability-dashboard) and [advanced dashboard example](https://clickhouse.com/blog/common-issues-you-can-solve-using-advanced-monitoring-dashboards#how-to-get-started-with-the-advanced-dashboard).
* Custom dashboard definitions can be served by the same `/dashboard` page from any table with the same schema as `system.dashboards`. This is useful for local one-off panels, but keep long-term dashboards in your normal observability system.
* ClickStack UI: starting with ClickHouse® 26.2, ClickStack / HyperDX is embedded in the ClickHouse® binary at `http://localhost:8123/clickstack`. Use it to explore local logs, traces, metrics, or ClickHouse® system tables. The embedded version is intended for local development and learning, not production deployments; it does not provide persistent state storage, alerting, or saved dashboard/query persistence. See [Introducing ClickStack embedded in ClickHouse](https://clickhouse.com/blog/clickstack-embedded-clickhouse).
* Keeper dashboard: `http://localhost:9182/dashboard`, only when `keeper_server.http_control.port` is enabled. The same HTTP control interface exposes commands and storage APIs, so restrict it with network controls. See [Keeper HTTP API and Dashboard](https://clickhouse.com/docs/operations/utilities/clickhouse-keeper-http-api).
* jemalloc UI: starting with ClickHouse® 26.2, `http://localhost:8123/jemalloc` shows allocator statistics and can fetch heap profiles. Use it for allocation and memory debugging, not steady-state monitoring; jemalloc profiling can add overhead. See [allocation profiling](https://clickhouse.com/docs/operations/allocation-profiling#jemalloc-web-ui).

### Prometheus + Grafana

Use Prometheus for production monitoring and alerting. Scrape ClickHouse® Server and ClickHouse® Keeper as separate targets when Keeper is used.

* ClickHouse® Server: enable the built-in [Prometheus endpoint](https://clickhouse.com/docs/en/operations/server-configuration-parameters/settings/#server_configuration_parameters-prometheus) in `clickhouse-server` config. It can expose metrics from `system.metrics`, `system.asynchronous_metrics`, `system.events`, and `system.errors`; newer versions can also expose histograms and dimensional metrics through the [Prometheus protocol handler](https://clickhouse.com/docs/interfaces/prometheus). Common dashboards: [14192](https://grafana.com/grafana/dashboards/14192) and [13500](https://grafana.com/grafana/dashboards/13500).
* ClickHouse® Keeper: starting with ClickHouse® 22.12, Keeper has its own Prometheus endpoint. Configure `prometheus.port` and `prometheus.endpoint` in the Keeper config and scrape every Keeper node; the release example uses port `9369` and `/metrics`. These are Keeper server metrics, not the same thing as ClickHouse® Server metrics about ZooKeeper / Keeper client activity. See the [22.12 release note](https://clickhouse.com/blog/clickhouse-release-22-12#clickhouse-keeper---prometheus-endpoint-antonio-andelic).
* Altinity Kubernetes Operator: if ClickHouse® is deployed by the operator, use the operator-managed metrics exporter, dashboards, and alerts. See the operator [Prometheus setup](https://github.com/Altinity/clickhouse-operator/blob/master/docs/prometheus_setup.md), [Grafana setup](https://github.com/Altinity/clickhouse-operator/blob/master/docs/grafana_setup.md), [dashboard](https://github.com/Altinity/clickhouse-operator/tree/master/grafana-dashboard), and [alert rules](https://github.com/Altinity/clickhouse-operator/blob/master/deploy/prometheus/prometheus-alert-rules-clickhouse.yaml).
* Operator-compatible metrics without the operator: if you do not run ClickHouse® in Kubernetes but want to reuse the operator Grafana dashboard, expose a `FORMAT Prometheus` query through an HTTP handler. See [Compatibility layer for the Altinity Kubernetes Operator for ClickHouse](../monitoring-operator-exporter-compatibility/).
* Legacy external exporter: [clickhouse_exporter](https://github.com/ClickHouse/clickhouse_exporter) with dashboard [882](https://grafana.com/grafana/dashboards/882) exists, but is unmaintained. Prefer the built-in exporter or the operator exporter for new deployments.

### Grafana dashboards querying ClickHouse® directly

Grafana can query ClickHouse® directly through a ClickHouse® datasource. This is useful for `system.query_log` analysis and ad hoc operational dashboards, but it is different from Prometheus monitoring: every refresh runs SQL on ClickHouse. Use a restricted read-only user, keep panels time-bounded, and avoid expensive high-cardinality queries on production clusters.

* Altinity / Vertamedia datasource: prefer [Altinity plugin for ClickHouse](https://grafana.com/grafana/plugins/vertamedia-clickhouse-datasource/) for new direct-query dashboards. It was initially developed by Vertamedia and has been maintained by Altinity since 2020. For modern Grafana use current 3.x versions; old pre-3.x versions were Angular-based. You can use the [operator queries dashboard](https://github.com/Altinity/clickhouse-operator/blob/master/grafana-dashboard/ClickHouse_Queries_dashboard.json) as a starting point.
* Official Grafana ClickHouse® datasource: [Grafana ClickHouse® datasource](https://grafana.com/grafana/plugins/grafana-clickhouse-datasource/) is an alternative when your Grafana stack standardizes on Grafana-maintained datasource plugins or needs its logs, traces, alerting, and OpenTelemetry-oriented workflows. Current plugin docs also list built-in dashboards for query, data, cluster, and OpenTelemetry analysis: [ClickHouse® datasource docs](https://grafana.com/docs/plugins/grafana-clickhouse-datasource/latest/).
* Older direct-query dashboards: [ClickHouse® Performance Monitor 13606](https://grafana.com/grafana/dashboards/13606) and [ClickHouse® Queries 2515](https://grafana.com/grafana/dashboards/2515) query ClickHouse® directly. Treat them as import examples to review and adapt, not drop-in production defaults. Dashboard 13606 states it was built for ClickHouse® 20.8.7; dashboard 2515 depends on `system.query_log`.

### Other monitoring integrations

These are secondary paths. Prefer Prometheus/Grafana for production monitoring and the Altinity Grafana datasource plugin for new direct-query dashboards unless your environment already standardizes on one of these tools.

#### Commercial monitoring platforms

These commercial platforms have ClickHouse® monitoring integrations or documented ClickHouse® monitoring workflows. Validate exact metric coverage, ClickHouse® version support, and ClickHouse® Keeper coverage before relying on a vendor dashboard as the only monitoring source.

* [Datadog](https://docs.datadoghq.com/integrations/clickhouse/?tab=host): provides a ClickHouse® integration for collecting service checks and metrics into Datadog.
* [Sematext](https://sematext.com/docs/integration/clickhouse/): provides a ClickHouse® integration for metrics, dashboards, and alerts in Sematext Cloud or Enterprise.
* [IBM Instana](https://www.ibm.com/docs/en/instana-observability?topic=technologies-monitoring-clickhouse): documents ClickHouse® monitoring in Instana Observability.
* [Site24x7](https://www.site24x7.com/plugins/clickhouse-monitoring.html): provides a ClickHouse® plugin-based monitoring workflow.
* [Acceldata Pulse](https://docs.acceldata.io/pulse/user-guide/clickhouse): documents ClickHouse® monitoring workflows in Acceldata Pulse.
* [Grafana Cloud](https://grafana.com/docs/grafana-cloud/monitor-infrastructure/integrations/integration-reference/integration-clickhouse/): provides a ClickHouse® integration with prebuilt dashboards and alerts.
* [ManageEngine Applications Manager](https://www.manageengine.com/products/applications_manager/clickhouse-monitoring.html): provides ClickHouse® monitoring through a Prometheus-based integration.
* [MetricFire](https://www.metricfire.com/integrations/clickhouse/): documents ClickHouse® monitoring with MetricFire-managed metrics.

#### Other integrations

* ClickStack / HyperDX: [ClickStack](https://clickhouse.com/clickstack) is a ClickHouse®-powered observability stack for OpenTelemetry logs, metrics, traces, session replay, dashboards, and alerts. It can use ClickHouse® as the observability backend, but still monitor the underlying ClickHouse® storage, ingestion, replication, and Keeper health separately.
* Zabbix: use the official [Zabbix ClickHouse® by HTTP template](https://www.zabbix.com/integrations/clickhouse) for current Zabbix deployments.
* Graphite-compatible pipelines: ClickHouse® can push `system.metrics`, `system.events`, and `system.asynchronous_metrics` to Graphite with `<graphite>` in `config.xml`; multiple `<graphite>` sections are supported for different intervals. See the ClickHouse® [Graphite configuration](https://clickhouse.com/docs/en/operations/server-configuration-parameters/settings/#server_configuration_parameters-graphite). Do not confuse this monitoring exporter with the [GraphiteMergeTree](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/graphitemergetree) table engine, which stores Graphite time-series data in ClickHouse®.
* InfluxDB / Telegraf: for InfluxDB stacks, prefer the [Telegraf ClickHouse® input plugin](https://docs.influxdata.com/telegraf/v1/input-plugins/clickhouse/) or scrape the ClickHouse® Prometheus endpoint through Telegraf. The old InfluxDB v1 [Graphite protocol](https://docs.influxdata.com/influxdb/v1/supported_protocols/graphite/) path is mainly for legacy Graphite-compatible pipelines.
* Nagios / Icinga: keep these checks coarse: `/ping`, `/replicas_status`, host checks, and a small number of thresholded SQL checks. If you write custom plugins, follow the standard [Monitoring Plugins guidelines](https://www.monitoring-plugins.org/doc/guidelines.html) for return codes, thresholds, timeouts, and one-line output. Do not rely on unmaintained ClickHouse®-specific plugins without reviewing them first.

### "Build your own" ClickHouse® monitoring

Use custom checks for smoke tests, Nagios / Icinga-style checks, or legacy monitoring systems. They are not a replacement for Prometheus / Grafana metric retention, dashboards, and alerting.

The HTTP examples assume the default HTTP interface on port `8123`; adjust the scheme, host, and port for HTTPS, load balancers, or non-default ports.

Enable rows for optional engines or Keeper-backed features only where those features are configured.

| Check name | Shell or SQL command | Severity |
| --- | --- | --- |
| ClickHouse® status | `$ curl 'http://localhost:8123/'`<br>`Ok.` | Critical |
| Too many simultaneous queries. Maximum: 100 by default | `SELECT value FROM system.metrics WHERE metric = 'Query'` | Critical |
| Replication status | `$ curl 'http://localhost:8123/replicas_status'`<br>`Ok.` | High |
| Read-only replicas, reflected by `replicas_status` as well | `SELECT value FROM system.metrics WHERE metric = 'ReadonlyReplica'` | High |
| Some replication tasks are stuck | `SELECT count() FROM system.replication_queue WHERE num_tries > 100 OR num_postponed > 1000` | High |
| ZooKeeper is available | `SELECT count() FROM system.zookeeper WHERE path = '/'` | Critical for writes |
| ZooKeeper exceptions | `SELECT value FROM system.events WHERE event = 'ZooKeeperHardwareExceptions'` | Medium |
| Other ClickHouse® nodes are available | ``$ for node in `echo "SELECT DISTINCT host_address FROM system.clusters WHERE host_name != 'localhost'" \| curl 'http://localhost:8123/' --silent --data-binary @-`; do curl "http://$node:8123/" --silent; done \| sort -u``<br>`Ok.` | High |
| All ClickHouse® clusters are available, meaning every configured cluster has enough replicas to serve queries | ``$ for cluster in `echo "SELECT DISTINCT cluster FROM system.clusters WHERE host_name != 'localhost'" \| curl 'http://localhost:8123/' --silent --data-binary @-`; do clickhouse-client --query="SELECT '$cluster', 'OK' FROM cluster('$cluster', system, one)"; done`` | Critical |
| There are files in `detached` folders | `$ find /var/lib/clickhouse/data/*/*/detached/* -type d \| wc -l`<br>ClickHouse® 19.8+: `SELECT count() FROM system.detached_parts` | Medium |
| Too many parts: number of parts is growing, inserts are being delayed, or inserts are being rejected | `SELECT value FROM system.asynchronous_metrics WHERE metric = 'MaxPartCountForPartition'`<br>`SELECT value FROM system.metrics WHERE metric = 'DelayedInserts'`<br>`SELECT value FROM system.events WHERE event = 'DelayedInserts'`<br>`SELECT value FROM system.events WHERE event = 'RejectedInserts'` | Critical |
| Dictionaries: exception | `SELECT concat(name, ': ', last_exception) FROM system.dictionaries WHERE last_exception != ''` | Medium |
| ClickHouse® has been restarted | `SELECT uptime()`<br>`SELECT value FROM system.asynchronous_metrics WHERE metric = 'Uptime'` |  |
| `DistributedFilesToInsert` should not be always increasing | `SELECT value FROM system.metrics WHERE metric = 'DistributedFilesToInsert'` | Medium |
| A data part was lost | `SELECT value FROM system.events WHERE event = 'ReplicatedDataLoss'` | High |
| Data parts are not the same on different replicas | `SELECT value FROM system.events WHERE event = 'DataAfterMergeDiffersFromReplica'`<br>`SELECT value FROM system.events WHERE event = 'DataAfterMutationDiffersFromReplica'` | Medium |

For deeper dashboards or incident drill-downs, include these system tables as inspection sources:

* [`system.metrics`](https://clickhouse.com/docs/operations/system-tables/metrics): current counters for active server state, queues, background work, and integration-specific gauges.
* [`system.asynchronous_metrics`](https://clickhouse.com/docs/operations/system-tables/asynchronous_metrics): periodically refreshed metrics such as uptime, part counts, and disk usage.
* [`system.events`](https://clickhouse.com/docs/operations/system-tables/events): cumulative event counters, including insert rejections, replication data-loss events, and ZooKeeper / Keeper client exceptions.
* [`system.replicas`](https://clickhouse.com/docs/operations/system-tables/replicas): replicated table state, queue size, delay, and session status.
* [`system.merges`](https://clickhouse.com/docs/operations/system-tables/merges): currently running merges and progress.
* [`system.mutations`](https://clickhouse.com/docs/operations/system-tables/mutations): pending and running mutations.
* [`system.detached_parts`](https://clickhouse.com/docs/operations/system-tables/detached_parts): detached parts for MergeTree tables, including reason and disk path when available.
* [`system.asynchronous_inserts`](https://clickhouse.com/docs/operations/system-tables/asynchronous_inserts): pending async inserts in the server memory queue.
* [`system.kafka_consumers`](https://clickhouse.com/docs/operations/system-tables/kafka_consumers): Kafka consumer assignments, offsets, recent exceptions, and dependencies.

{{% alert title="Warning" color="warning" %}}
Scraped metrics are not a complete history. Short-lived states between scrapes can be missed.
{{% /alert %}}

Interpret these tables by signal type:

* `system.metrics` is a point-in-time view of current values. For example, `Query` is the number of queries running when the table is read.
* `system.asynchronous_metrics` is also a snapshot, but values are calculated periodically in the background.
* `system.events` contains cumulative counters since server start. Alert on deltas or rates between scrapes, not on the raw value alone, except for rare counters where any increase is meaningful.

If you need a full picture of query volume, latency, errors, or short-lived query spikes, use [`system.query_log`](https://clickhouse.com/docs/operations/system-tables/query_log) in addition to scraped metrics.

## Monitoring ClickHouse® logs

[ClickHouse® logs](/altinity-kb-setup-and-maintenance/logging/) can be another important source of information. There are 2 logs enabled by default
* /var/log/clickhouse-server/clickhouse-server.err.log (error & warning, you may want to keep an eye on that or send it to some monitoring system)
* /var/log/clickhouse-server/clickhouse-server.log (trace logs,  very detailed, useful for debugging, usually too verbose to monitor).

The server log level is controlled by `logger.level` and optional per-output / per-logger overrides. In the upstream default config `logger.level` is `trace`, which is very verbose. `system.text_log` has its own `<text_log><level>` filter, but it only receives messages that already passed the server logger level. Setting `<text_log><level>trace</level>` will not recover trace / debug messages if the server logger is configured at `information`, `warning`, or another less verbose level. Valid levels include `fatal`, `critical`, `error`, `warning`, `notice`, `information`, `debug`, and `trace`. Allowing `trace` or `debug` in both places is useful for troubleshooting, but it can make `system.text_log` grow quickly.

Since ClickHouse® 24.8, the upstream default config enables `system.text_log` with `<level>trace</level>`. In older versions, or in custom packages/configs, you may still need to enable it manually. Ensure that you will not expose sensitive log messages to users who should not see them.

{{% alert title="Warning" color="warning" %}}
With the default `trace` level, `system.text_log` can grow quickly. If you keep it enabled in production, set an appropriate `level`, `partition_by`, `order_by`, and `ttl`. Without a TTL, system log table growth is not bounded by retention.
{{% /alert %}}

Check the current volume before using `system.text_log` for monitoring:

```sql
SELECT
    level,
    count(),
    min(event_time),
    max(event_time)
FROM system.text_log
GROUP BY level
ORDER BY level;
```

Example configuration with fewer rows:

```
$ cat /etc/clickhouse-server/config.d/text_log.xml
<clickhouse>
    <text_log>
        <database>system</database>
        <table>text_log</table>
        <flush_interval_milliseconds>7500</flush_interval_milliseconds>
        <level>warning</level>
        <partition_by>toYYYYMM(event_date)</partition_by>
        <order_by>event_date, event_time, level, logger_name</order_by>
        <ttl>event_date + INTERVAL 30 DAY DELETE</ttl>
    </text_log>
</clickhouse>
```

## Other sources

* [OpenTelemetry support](https://clickhouse.com/docs/en/operations/opentelemetry/)
* [Monitor ClickHouse® with Datadog](https://www.datadoghq.com/blog/monitor-clickhouse/)
* [Unsorted notes on monitor and Alerts](https://docs.google.com/spreadsheets/d/1K92yZr5slVQEvDglfZ88k_7bfsAKqahY9RPp_2tSdVU/edit#gid=521173956)
* [Tencent Cloud ClickHouse® Monitoring Metrics](https://intl.cloud.tencent.com/document/product/1026/36887)
* [Tinybird experience (scroll to monitoring section)](https://www.tinybird.co/blog/what-i-learned-operating-clickhouse-part-ii)
