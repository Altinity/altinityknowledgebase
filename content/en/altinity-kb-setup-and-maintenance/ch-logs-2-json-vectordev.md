---
title: "Transformation Clickhouse logs to ndjson using Vector.dev"
linkTitle: "Clickhouse logs and Vector.dev"
weight: 100
description: >-
     Transformation Clickhouse logs to ndjson using Vector.dev
---

### ClickHouse 22.8

Starting from 22.8 version, ClickHouse support writing logs in JSON format:

```
<?xml version="1.0"?>
<clickhouse>
    <logger>
        <!-- Structured log formatting:
        You can specify log format(for now, JSON only). In that case, the console log will be printed
        in specified format like JSON.
        For example, as below:
        {"date_time":"1650918987.180175","thread_name":"#1","thread_id":"254545","level":"Trace","query_id":"","logger_name":"BaseDaemon","message":"Received signal 2","source_file":"../base/daemon/BaseDaemon.cpp; virtual void SignalListener::run()","source_line":"192"}
        To enable JSON logging support, just uncomment <formatting> tag below.
        -->
        <formatting>json</formatting>
    </logger>
</clickhouse>
```


## Transformation Clickhouse logs to ndjson using Vector.dev"

### Installation of vector.dev

```bash
# arm64
wget https://packages.timber.io/vector/0.15.2/vector_0.15.2-1_arm64.deb

# amd64
wget https://packages.timber.io/vector/0.15.2/vector_0.15.2-1_amd64.deb

dpkg -i vector_0.15.2-1_*.deb

systemctl stop vector

mkdir /var/log/clickhouse-server-json

chown vector.vector /var/log/clickhouse-server-json

usermod -a -G clickhouse vector
```

### vector config

```toml
# cat /etc/vector/vector.toml
data_dir = "/var/lib/vector"

[sources.clickhouse-log]
  type                          = "file"
  include                       = [ "/var/log/clickhouse-server/clickhouse-server.log" ]
  fingerprinting.strategy       = "device_and_inode"
  message_start_indicator = '^\d+\.\d+\.\d+ \d+:\d+:\d+'
  multi_line_timeout = 1000


[transforms.clickhouse-log-text]
  inputs                        = [ "clickhouse-log" ]
  type                          = "remap"
  source = '''
     . |= parse_regex!(.message, r'^(?P<timestamp>\d+\.\d+\.\d+ \d+:\d+:\d+\.\d+) \[\s?(?P<thread_id>\d+)\s?\] \{(?P<query_id>.*)\} <(?P<severity>\w+)> (?s)(?P<message>.*$)')
  '''

[sinks.emit-clickhouse-log-json]
  type = "file"
  inputs = [ "clickhouse-log-text" ]
  compression = "none"
  path = "/var/log/clickhouse-server-json/clickhouse-server.%Y-%m-%d.ndjson"
  encoding.only_fields = ["timestamp", "thread_id", "query_id", "severity", "message" ]
  encoding.codec = "ndjson"
```

### start 

```
systemctl start vector

tail /var/log/clickhouse-server-json/clickhouse-server.2022-04-21.ndjson
{"message":"DiskLocal: Reserving 1.00 MiB on disk `default`, having unreserved 166.80 GiB.","query_id":"","severity":"Debug","thread_id":"283239","timestamp":"2022.04.21 13:43:21.164660"}
{"message":"MergedBlockOutputStream: filled checksums 202204_67118_67118_0 (state Temporary)","query_id":"","severity":"Trace","thread_id":"283239","timestamp":"2022.04.21 13:43:21.166810"}
{"message":"system.metric_log (e3365172-4c9b-441b-b803-756ae030e741): Renaming temporary part tmp_insert_202204_67118_67118_0 to 202204_171703_171703_0.","query_id":"","severity":"Trace","thread_id":"283239","timestamp":"2022.04.21 13:43:21.167226"}
....
```

### sink logs into ClickHouse table

Be carefull with logging ClickHouse messages into the same ClickHouse instance, it will cause endless recursive self-logging.

```sql
create table default.clickhouse_logs(
  timestamp DateTime64(3),
  host LowCardinality(String),
  thread_id LowCardinality(String),
  severity LowCardinality(String),
  query_id String,
  message String)
Engine = MergeTree 
Partition by toYYYYMM(timestamp)
Order by (toStartOfHour(timestamp), host, severity, query_id);

create user vector identified  by 'vector1234';
grant insert on default.clickhouse_logs to vector;
create settings profile or replace profile_vector settings log_queries=0 readonly TO vector;
```

```toml
[sinks.clickhouse-output-clickhouse]
    inputs   = ["clickhouse-log-text"]
    type     = "clickhouse"

    host = "http://localhost:8123"
    database = "default"
    auth.strategy = "basic"
    auth.user = "vector"
    auth.password = "vector1234"
    healthcheck = true
    table = "clickhouse_logs"

    encoding.timestamp_format = "unix"

    buffer.type = "disk"
    buffer.max_size = 104900000
    buffer.when_full = "block"

    request.in_flight_limit = 20

    encoding.only_fields =  ["host", "timestamp", "thread_id", "query_id", "severity", "message"]
```

```sql
select * from default.clickhouse_logs limit 10;
┌───────────────timestamp─┬─host───────┬─thread_id─┬─severity─┬─query_id─┬─message─────────────────────────────────────────────────────
│ 2022-04-21 19:08:13.443 │ clickhouse │ 283155    │ Debug    │          │ HTTP-Session: 13e87050-7824-46b0-9bd5-29469a1b102f Authentic
│ 2022-04-21 19:08:13.443 │ clickhouse │ 283155    │ Debug    │          │ HTTP-Session: 13e87050-7824-46b0-9bd5-29469a1b102f Authentic
│ 2022-04-21 19:08:13.443 │ clickhouse │ 283155    │ Debug    │          │ HTTP-Session: 13e87050-7824-46b0-9bd5-29469a1b102f Creating
│ 2022-04-21 19:08:13.447 │ clickhouse │ 283155    │ Debug    │          │ MemoryTracker: Peak memory usage (for query): 4.00 MiB.
│ 2022-04-21 19:08:13.447 │ clickhouse │ 283155    │ Debug    │          │ HTTP-Session: 13e87050-7824-46b0-9bd5-29469a1b102f Destroyin
│ 2022-04-21 19:08:13.495 │ clickhouse │ 283155    │ Debug    │          │ HTTP-Session: f7eb829f-7b3a-4c43-8a41-a2e6676177fb Authentic
│ 2022-04-21 19:08:13.495 │ clickhouse │ 283155    │ Debug    │          │ HTTP-Session: f7eb829f-7b3a-4c43-8a41-a2e6676177fb Authentic
│ 2022-04-21 19:08:13.495 │ clickhouse │ 283155    │ Debug    │          │ HTTP-Session: f7eb829f-7b3a-4c43-8a41-a2e6676177fb Creating
│ 2022-04-21 19:08:13.496 │ clickhouse │ 283155    │ Debug    │          │ MemoryTracker: Peak memory usage (for query): 4.00 MiB.
│ 2022-04-21 19:08:13.496 │ clickhouse │ 283155    │ Debug    │          │ HTTP-Session: f7eb829f-7b3a-4c43-8a41-a2e6676177fb Destroyin
└─────────────────────────┴────────────┴───────────┴──────────┴──────────┴─────────────────────────────────────────────────────────────
```
