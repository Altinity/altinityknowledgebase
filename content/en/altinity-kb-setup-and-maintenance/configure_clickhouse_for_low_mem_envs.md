---
title: "Configure ClickHouse® for low memory environments"
linkTitle: "Configure ClickHouse® for low memory environments"
description: >
    Configure ClickHouse® for low memory environments
---

While Clickhouse® it's typically deployed on powerful servers with ample memory and CPU, it can be deployed in resource-constrained environments like a Raspberry Pi. Whether you're working on edge computing, IoT data collection, or simply experimenting with ClickHouse in a small-scale setup, running it efficiently on low-memory hardware can be a rewarding challenge.

TLDR;

```xml
<!-- config.xml -->
<!-- These settinsg should allow to run clickhouse in nodes with 4GB/8GB RAM -->
<clickhouse>
  <!-- disable some optional components/tables -->
  <mysql_port remove="1" />
  <postgresql_port remove="1" />  
  <query_thread_log remove="1" />
  <opentelemetry_span_log remove="1" />
  <processors_profile_log remove="1" />   

  <!-- disable mlock, allowing binary pages to be unloaded from RAM, relying on Linux defaults -->
  <mlock_executable>false</mlock_executable> 

  <!-- decrease the cache sizes -->
  <mark_cache_size>268435456</mark_cache_size> <!-- 256 MB -->
  <index_mark_cache_size>67108864</index_mark_cache_size> <!-- 64 MB -->
  <uncompressed_cache_size>16777216</uncompressed_cache_size> <!-- 16 MB -->

  <!-- control the concurrency -->
  <max_thread_pool_size>2000</max_thread_pool_size>
  <max_connections>64</max_connections>
  <max_concurrent_queries>8</max_concurrent_queries>
  <max_server_memory_usage_to_ram_ratio>0.75</max_server_memory_usage_to_ram_ratio> <!-- 75% of the RAM, leave more for the system -->
  <max_server_memory_usage>0</max_server_memory_usage> <!-- We leave the overcommiter to manage available ram for queries-->

  <!-- reconfigure the main pool to limit the merges (those can create problems if the insert pressure is high) -->
  <background_pool_size>2</background_pool_size>
  <background_merges_mutations_concurrency_ratio>2</background_merges_mutations_concurrency_ratio>
  <merge_tree>
    <merge_max_block_size>1024</merge_max_block_size>
    <max_bytes_to_merge_at_max_space_in_pool>1073741824</max_bytes_to_merge_at_max_space_in_pool> <!-- 1 GB max part-->
    <number_of_free_entries_in_pool_to_lower_max_size_of_merge>2</number_of_free_entries_in_pool_to_lower_max_size_of_merge>
    <number_of_free_entries_in_pool_to_execute_mutation>2</number_of_free_entries_in_pool_to_execute_mutation>
    <number_of_free_entries_in_pool_to_execute_optimize_entire_partition>2</number_of_free_entries_in_pool_to_execute_optimize_entire_partition>
  </merge_tree>

  <!-- shrink all pools to minimum-->
  <background_buffer_flush_schedule_pool_size>1</background_buffer_flush_schedule_pool_size>
  <background_merges_mutations_scheduling_policy>round_robin</background_merges_mutations_scheduling_policy>
  <background_move_pool_size>1</background_move_pool_size>
  <background_fetches_pool_size>1</background_fetches_pool_size>
  <background_common_pool_size>2</background_common_pool_size>
  <background_schedule_pool_size>8</background_schedule_pool_size>
  <background_message_broker_schedule_pool_size>1</background_message_broker_schedule_pool_size>
  <background_distributed_schedule_pool_size>1</background_distributed_schedule_pool_size>
  <tables_loader_foreground_pool_size>0</tables_loader_foreground_pool_size>
  <tables_loader_background_pool_size>0</tables_loader_background_pool_size>   
</clickhouse>
```

```xml
<!-- users.xml -->
<clickhouse>
  <profiles>
    <default>
      <max_threads>2</max_threads>
      <max_block_size>8192</max_block_size>
      <queue_max_wait_ms>1000</queue_max_wait_ms>
      <max_execution_time>600</max_execution_time>
      <input_format_parallel_parsing>0</input_format_parallel_parsing>
      <output_format_parallel_formatting>0</output_format_parallel_formatting>
      <max_bytes_before_external_group_by>3221225472</max_bytes_before_external_group_by> <!-- 3 GB -->
      <max_bytes_before_external_sort>3221225472</max_bytes_before_external_sort> <!-- 3 GB -->
    </default>
  </profiles>
</clickhouse>
```

Some interesting settings to explain:

- Disabling both postgres/mysql interfaces will release some CPU/memory resources.
- Disabling some system tables like `processor_profile_log`, `opentelemetry_span_log`, or `query_thread_log`  will help reducing write amplification. Those tables write a lot of data very frequently. In a Raspi4 with 4 GB of RAM and a simple USB3.1 storage they can spend some needed resources.
- Decrease mark caches. Defaults are 5GB and they are loaded into RAM (in newer versions this behavior of loading them completely in RAM can be tuned with a prewarm setting [https://github.com/ClickHouse/ClickHouse/pull/71053](https://github.com/ClickHouse/ClickHouse/pull/71053)) so better to reserve a reasonable amount of space in line with the total amount of RAM. For example for 4/8GB 256MB is a good value.
- Tune server memory and leave 25% for OS ops (`max_server_memory_usage_to_ram_ratio`)
- Tune the thread pools and queues for merges and mutations:
    - `merge_max_block_size`  will reduce the number of rows per block when merging. Default is 8192 and this will reduce the memory usage of merges.
    - The `number_of_free_entries_in_pool`  settings are very nice to tune how much concurrent merges are allowed in the queue. When there is less than specified number of free entries in pool , start to lower maximum size of merge to process (or to put in queue) or do not execute part mutations to leave free threads for regular merges . This is to allow small merges to process - not filling the pool with long running merges or multiple mutations. You can check clickhouse documentation to get more insights.
- Reduce the background pools and be conservative. In a Raspi4 with 4 cores and 4 GB or ram, background pool should be not bigger than the number of cores and even less if possible.
- Tune some profile settings to enable disk spilling (`max_bytes_before_external_group_by`  and `max_bytes_before_external_sort`) and reduce the number of threads per query plus enable queuing of queries (`queue_max_wait_ms`) if the `max_concurrent_queries`  limit is exceeded. Also `max_block_size` is not usually touched but in this case we can lower it ro reduce RAM usage.
