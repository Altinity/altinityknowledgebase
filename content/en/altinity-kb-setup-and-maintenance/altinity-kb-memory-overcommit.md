---
title: "Memory Overcommiter"
linkTitle: "Memory Overcommiter"
description: >
    Enable Memory overcommiter instead of ussing `max_memory_usage` per query
---

## Memory Overcommiter

From version 22.2+ [ClickHouse® was updated with enhanced Memory overcommit capabilities](https://github.com/ClickHouse/ClickHouse/pull/31182). In the past, queries were constrained by the `max_memory_usage` setting, imposing a rigid limitation. Users had the option to increase this limit, but it came at the potential expense of impacting other users during a single query. With the introduction of Memory overcommit, more memory-intensive queries can now execute, granted there are ample resources available. When the [server reaches its maximum memory limit](https://clickhouse.com/docs/en/operations/server-configuration-parameters/settings#max_server_memory_usage), ClickHouse identifies the most overcommitted queries and attempts to terminate them. It's important to note that the terminated query might not be the one causing the condition. If it's not, the query will undergo a waiting period to allow the termination of the high-memory query before resuming its execution. This setup ensures that low-memory queries always have the opportunity to run, while more resource-intensive queries can execute during server idle times when resources are abundant. Users have the flexibility to fine-tune this behavior at both the server and user levels.

If the memory overcommitter is not being used you'll get something like this:

```bash
Received exception from server (version 22.8.20):
Code: 241. DB::Exception: Received from altinity.cloud:9440. DB::Exception: Received from chi-replica1-2-0:9000. DB::Exception: Memory limit (for query) exceeded: would use 5.00 GiB (attempt to allocate chunk of 4196736 bytes), maximum: 5.00 GiB. OvercommitTracker decision: Memory overcommit isn't used. OvercommitTracker isn't set.: (avg_value_size_hint = 0, avg_chars_size = 1, limit = 8192): while receiving packet from chi-replica1-1-0:9000: While executing Remote. (MEMORY_LIMIT_EXCEEDED)
```

So to enable Memory Overcommit you need to get rid of the `max_memory_usage` and `max_memory_usage_for_user` (set them to 0) and configure overcommit specific settings (**usually defaults are ok, so read carefully the documentation**)

- `memory_overcommit_ratio_denominator`: It represents soft memory limit on the user level. This value is used to compute query overcommit ratio.
- `memory_overcommit_ratio_denominator_for_user`: It represents soft memory limit on the global level. This value is used to compute query overcommit ratio.
- `memory_usage_overcommit_max_wait_microseconds`: Maximum time thread will wait for memory to be freed in the case of memory overcommit. If timeout is reached and memory is not freed, exception is thrown

Please check https://clickhouse.com/docs/en/operations/settings/memory-overcommit

Also you will check/need to configure global memory server setting. These are by default:

```xml
<clickhouse>
   <!-- when max_server_memory_usage is set to non-zero, max_server_memory_usage_to_ram_ratio is ignored-->
    <max_server_memory_usage>0</max_server_memory_usage>
    <max_server_memory_usage_to_ram_ratio>0.9</max_server_memory_usage_to_ram_ratio> 
</clickhouse>
```

With these set, now if you execute some queries with bigger memory needs than your `max_server_memory_usage` you'll get something like this:

```bash
Received exception from server (version 22.8.20):
Code: 241. DB::Exception: Received from altinity.cloud:9440. DB::Exception: Received from chi-test1-2-0:9000. DB::Exception: Memory limit (total) exceeded: would use 12.60 GiB (attempt to allocate chunk of 4280448 bytes), maximum: 12.60 GiB. OvercommitTracker decision: Query was selected to stop by OvercommitTracker.: while receiving packet from chi-replica1-2-0:9000: While executing Remote. (MEMORY_LIMIT_EXCEEDED)
```

This will allow you to know that the Overcommit memory tracker is set and working.

Also to note that maybe you don't need the Memory Overcommit system because with `max_memory_usage` per query you're ok.

The good thing about memory overcommit is that you let ClickHouse handle the memory limitations instead of doing it manually, but there may be some scenarios where you don't want to use it and using `max_memory_usage` or `max_memory_usage_for_user` is a better fit. For example, if your workload has a lot of small/medium queries that are not memory intensive and you need to run few memory intensive queries for some users with a fixed memory limit. This is a common scenario for `dbt` or other ETL tools that usually run big memory intensive queries.

