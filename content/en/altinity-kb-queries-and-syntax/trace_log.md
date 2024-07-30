---
title: "Collecting query execution flamegraphs using system.trace_log"
linkTitle: "trace_log"
weight: 100
description: >-
     Collecting query execution flamegraph using trace_log
---

## Collecting query execution flamegraph using system.trace_log

ClickHouse® has embedded functionality to analyze the details of query performance.

It's `system.trace_log` table.

By default it collects information only about queries when runs longer than 1 sec (and collects stacktraces every second).

You can adjust that per query using settings `query_profiler_real_time_period_ns` & `query_profiler_cpu_time_period_ns`.

Both works very similar (with desired interval dump the stacktraces of all the threads which execute the query).
real timer - allows to 'see' the situtions when cpu was not working much, but time was spend for example on IO.
cpu timer - allows to see the 'hot' points in calculations more accurately (skip the io time).

Trying to collect stacktraces with a frequency higher than few KHz is usually not possible. 

To check where most of the RAM is used you can collect stacktraces during memory allocations / deallocation, by using the
setting `memory_profiler_sample_probability`.


### clickhouse-speedscope

```bash 
# install 
wget https://github.com/laplab/clickhouse-speedscope/archive/refs/heads/master.tar.gz -O clickhouse-speedscope.tar.gz
tar -xvzf clickhouse-speedscope.tar.gz
cd clickhouse-speedscope-master/
pip3 install -r requirements.txt
```

For debugging particular query:
```
clickhouse-client 

SET query_profiler_cpu_time_period_ns=1000000; -- 1000 times per 'cpu' sec
-- or SET query_profiler_real_time_period_ns=2000000; -- 500 times per 'real' sec.
-- or SET memory_profiler_sample_probability=0.1; -- to debug the memory allocations

SELECT ... <your select>

SYSTEM FLUSH LOGS;

-- get the query_id from the clickhouse-client output or from system.query_log (also pay attention on query_id vs initial_query_id for distributed queries).
```

Now let's process that: 
```
python3 main.py &  # start the proxy in background
python3 main.py --query-id 908952ee-71a8-48a4-84d5-f4db92d45a5d # process the stacktraces
fg # get the proxy from background 
Ctrl + C  # stop it.
```

To access ClickHouse with other username / password etc. - see the sources of https://github.com/laplab/clickhouse-speedscope/blob/master/main.py


### clickhouse-flamegraph

Installation & usage instructions: https://github.com/Slach/clickhouse-flamegraph

### pure flamegraph.pl examples

```
git clone https://github.com/brendangregg/FlameGraph /opt/flamegraph

clickhouse-client -q "SELECT  arrayStringConcat(arrayReverse(arrayMap(x -> concat( addressToLine(x), '#', demangle(addressToSymbol(x)) ), trace)), ';') AS stack, count() AS samples FROM system.trace_log WHERE event_time >= subtractMinutes(now(),10) GROUP BY trace FORMAT TabSeparated" | /opt/flamegraph/flamegraph.pl > flamegraph.svg

clickhouse-client -q "SELECT  arrayStringConcat((arrayMap(x -> concat(splitByChar('/', addressToLine(x))[-1], '#', demangle(addressToSymbol(x)) ), trace)), ';') AS stack, sum(abs(size)) AS samples FROM system.trace_log where trace_type = 'Memory' and event_date = today() group by trace order by samples desc FORMAT TabSeparated" | /opt/flamegraph/flamegraph.pl > allocs.svg
clickhouse-client -q "SELECT  arrayStringConcat(arrayReverse(arrayMap(x -> concat(splitByChar('/', addressToLine(x))[-1], '#', demangle(addressToSymbol(x)) ), trace)), ';') AS stack, count() AS samples FROM system.trace_log where trace_type = 'Memory' group by trace FORMAT TabSeparated SETTINGS allow_introspection_functions=1" | /opt/flamegraph/flamegraph.pl > ~/mem1.svg
```

### similar using perf 

```
apt-get update -y 
apt-get install -y linux-tools-common linux-tools-generic linux-tools-`uname -r`git
apt-get install -y clickhouse-common-static-dbg clickhouse-common-dbg
mkdir -p /opt/flamegraph
git clone https://github.com/brendangregg/FlameGraph /opt/flamegraph

perf record -F 99 -p $(pidof clickhouse) -G
perf script > /tmp/out.perf
/opt/flamegraph/stackcollapse-perf.pl /tmp/out.perf | /opt/flamegraph/flamegraph.pl > /tmp/flamegraph.svg
```

### also 

https://kb.altinity.com/altinity-kb-queries-and-syntax/troubleshooting/#flamegraph

https://github.com/samber/grafana-flamegraph-panel/pull/2
