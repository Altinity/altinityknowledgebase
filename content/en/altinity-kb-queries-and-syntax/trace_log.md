---
title: "Collecting query execution flamegraphs using system.trace_log"
linkTitle: "trace_log"
weight: 100
description: >-
     Collecting query execution flamegraph using trace_log
---

## Collecting query execution flamegraph using system.trace_log

ClickHouse® provides an embedded functionality to analyze query performance in detail through the system.trace_log table.

By default, this table collects information about queries that run longer than 1 second, capturing stack traces every second. However, you can customize the trace collection using the following settings:

query_profiler_real_time_period_ns: Adjusts the interval for collecting stack traces based on real time.
query_profiler_cpu_time_period_ns: Adjusts the interval based on CPU time.
Both settings work similarly by dumping stack traces of all threads running the query at the specified intervals. The real-time profiler helps in identifying situations where CPU usage is low but significant time is spent on I/O, while the CPU timer pinpoints hot spots in calculations more accurately by skipping I/O time.

Note: Attempting to collect stack traces at frequencies higher than a few KHz is typically not feasible.

####  Memory Profiling
To examine RAM usage, stack traces can be collected during memory allocations and deallocations using the memory_profiler_sample_probability setting.

## Tools for Analyzing Stack Traces

### clickhouse-speedscope
This tool processes the collected stack traces for analysis.

Installation:

```bash 
# install 
wget https://github.com/laplab/clickhouse-speedscope/archive/refs/heads/master.tar.gz -O clickhouse-speedscope.tar.gz
tar -xvzf clickhouse-speedscope.tar.gz
cd clickhouse-speedscope-master/
pip3 install -r requirements.txt
```

For debugging particular query:
1. In the clickhouse-client, set your desired profiler settings:
```sql
clickhouse-client 

SET query_profiler_cpu_time_period_ns=1000000; -- 1000 times per 'cpu' sec
-- or
SET query_profiler_real_time_period_ns=2000000; -- 500 times per 'real' sec.
-- or
SET memory_profiler_sample_probability=0.1; -- to debug the memory allocations
```
2. Execute your query:
```sql
SELECT ... <your select>
```
3. Flush the logs:
```sql
SYSTEM FLUSH LOGS;
```
4. Retrieve the query_id from either the clickhouse-client output or from system.query_log (note the difference between query_id and initial_query_id for distributed queries).
5. Process the stack traces:

```bash
python3 main.py &  # start the proxy in background
python3 main.py --query-id 908952ee-71a8-48a4-84d5-f4db92d45a5d # process the stacktraces
fg # get the proxy from background 
Ctrl + C  # stop it.
```
For additional configuration options, refer to the source of the tool: clickhouse-speedscope https://github.com/laplab/clickhouse-speedscope/blob/master/main.py

### clickhouse-flamegraph

For more advanced visualizations, clickhouse-flamegraph can be used. Installation and usage instructions are available on its GitHub page https://github.com/Slach/clickhouse-flamegraph

Example for Generating a Flamegraph:

1. Install FlameGraph:
```bash
git clone https://github.com/brendangregg/FlameGraph /opt/flamegraph
```
2. Generate a flamegraph from the system.trace_log:
```bash
clickhouse-client -q "SELECT  arrayStringConcat(arrayReverse(arrayMap(x -> concat( addressToLine(x), '#', demangle(addressToSymbol(x)) ), trace)), ';') AS stack, count() AS samples FROM system.trace_log WHERE event_time >= subtractMinutes(now(),10) GROUP BY trace FORMAT TabSeparated" | /opt/flamegraph/flamegraph.pl > flamegraph.svg

clickhouse-client -q "SELECT  arrayStringConcat((arrayMap(x -> concat(splitByChar('/', addressToLine(x))[-1], '#', demangle(addressToSymbol(x)) ), trace)), ';') AS stack, sum(abs(size)) AS samples FROM system.trace_log where trace_type = 'Memory' and event_date = today() group by trace order by samples desc FORMAT TabSeparated" | /opt/flamegraph/flamegraph.pl > allocs.svg
```
3. For memory allocation analysis:
```bash
clickhouse-client -q "SELECT  arrayStringConcat(arrayReverse(arrayMap(x -> concat(splitByChar('/', addressToLine(x))[-1], '#', demangle(addressToSymbol(x)) ), trace)), ';') AS stack, count() AS samples FROM system.trace_log where trace_type = 'Memory' group by trace FORMAT TabSeparated SETTINGS allow_introspection_functions=1" | /opt/flamegraph/flamegraph.pl > ~/mem1.svg
```



### Using perf 

Using perf for System-Wide Profiling
perf can be used for system-wide profiling, particularly for capturing CPU usage:

1. Install necessary tools:
```bash
apt-get update -y 
apt-get install -y linux-tools-common linux-tools-generic linux-tools-`uname -r`git
apt-get install -y clickhouse-common-static-dbg clickhouse-common-dbg
mkdir -p /opt/flamegraph
git clone https://github.com/brendangregg/FlameGraph /opt/flamegraph
```
2. Record the performance data:
```bash
perf record -F 99 -p $(pidof clickhouse) -G
```
3. Process the performance data:

```bash
perf script > /tmp/out.perf
/opt/flamegraph/stackcollapse-perf.pl /tmp/out.perf | /opt/flamegraph/flamegraph.pl > /tmp/flamegraph.svg
```

### also 

https://kb.altinity.com/altinity-kb-queries-and-syntax/troubleshooting/#flamegraph

https://github.com/samber/grafana-flamegraph-panel/pull/2
