---
title: "Transformation Clickhouse logs to ndjson using Vector.dev"
linkTitle: "Clickhouse logs and Vector.dev"
weight: 100
description: >-
     Transformation Clickhouse logs to ndjson using Vector.dev
---

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
cat /etc/vector/vector.toml
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

