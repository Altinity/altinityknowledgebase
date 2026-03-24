---
title: "Aggressive merges"
linkTitle: "Aggressive merges"
description: >
    Aggressive merges
---


 
Q: Is there any way I can dedicate more resources to the merging process when running ClickHouse® on pretty beefy machines (like 36 cores, 1TB of RAM, and large NVMe disks)?

## When this article applies

This article is for bulk-ingest or merge-backlog workloads on oversized hardware, where you want ClickHouse® to spend more CPU and I/O budget on background merges. It is not a generic tuning template for clusters that must sustain low-latency reads and writes on the same nodes.

Those recommendations are NOT generic. For systems with real-time insert and select pressure happening together with merges, those adjustments can be too aggressive. If you have different setups with different usage patterns, avoid using the same aggressive settings template for all of them.

Mostly such things are done by changing the level of parallelism:

 1.  `background_pool_size` - how many threads will actually be doing merges and mutations. If you can push most server resources toward merges, for example in a controlled backlog-clearing window with little foreground traffic, you can raise it aggressively. If you use replicated tables, review `max_replicated_merges_in_queue` together with it.

 2.  `background_merges_mutations_concurrency_ratio` - how many merges and mutations may be assigned relative to `background_pool_size`. Sometimes the default (`2`) may work against you by favoring more smaller tasks, which is useful for continuous real-time inserts but less useful when you want a backlog-clearing merge window. In that case, trying `1` is reasonable.
 
 3. `number_of_free_entries_in_pool_to_lower_max_size_of_merge` (merge_tree setting) should be changed together with background_pool_size (50-90% of that). "When there is less than a specified number of free entries in the pool (or replicated queue), start to lower the maximum size of the merge to process (or to put in the queue). This is to allow small merges to process - not filling the pool with long-running merges."  To make it really aggressive try 90-95% of background_pool_size, for ex. 34 (so you will have 34 huge merges and 2 small ones).

## Runtime vs restart semantics

Treat this template as a deliberate capacity-mode change, not casual live tuning. According to current ClickHouse docs, `background_pool_size` and `background_merges_mutations_concurrency_ratio` can be increased at runtime, but lowering them requires a restart.

## Merge scheduling tradeoffs

`background_merges_mutations_scheduling_policy` is an adjacent knob worth considering:

- `shortest_task_first` helps clear small parts quickly, but can starve large merges if inserts keep producing small parts.
- `round_robin` is safer when starvation of large merges is a concern.

## Other settings to consider

Additionally, you can:

 - control how large target parts may become via `max_bytes_to_merge_at_max_space_in_pool` if the backlog is dominated by many medium parts instead of tiny fragments.
 - review `min_merge_bytes_to_use_direct_io` if you suspect page-cache churn during very large merges. Direct I/O is workload-dependent, so benchmark it instead of assuming it is always better or worse.
 - on replicated tables with slow merges and a fast network, consider `execute_merges_on_single_replica_time_threshold` so one replica performs the merge and others can fetch the merged part instead of repeating the same work.
 - analyze whether Vertical or Horizontal merge is better for your schema. Vertical merges typically use less RAM and keep fewer files open, while Horizontal merges may be simpler and faster for some layouts.
 - if you have a lot of tables, review scheduler capacity as well: `background_schedule_pool_size` and `background_common_pool_size`.
 - review the schema, especially codecs/compression, because they reduce size but can materially change merge speed.
 - try to form bigger parts during inserts with `min_insert_block_size_bytes`, `min_insert_block_size_rows`, and `max_insert_block_size`.
 - check whether Wide or Compact parts are being created (`system.parts`). Part format is controlled by `min_bytes_for_wide_part` and `min_rows_for_wide_part`, so inspect those settings for your version instead of assuming a fixed default cutoff.
 - consider using recent ClickHouse releases, because mark compression improvements can reduce I/O overhead in merge-heavy workloads.

## How to validate changes

All adjustments should be validated with a reproducible benchmark or controlled backlog-clearing test. Compare the before/after trend for merge backlog or part counts, then watch whether the system clears the backlog faster without harming foreground workload. Also monitor how system resources are used or saturated during the test, especially CPU, disk I/O, and for replicated tables network plus ClickHouse Keeper / ZooKeeper load.

Monitor or plot pool usage:
```
select * from system.metrics where metric like '%PoolTask'
```

If the relevant pool task counters stay near saturation while backlog does not improve, you are likely limited by another bottleneck such as disk bandwidth, network fetches, or insert shape rather than by merge thread count alone.

## Do not use this template when...

- the same nodes must sustain low-latency reads and writes continuously, with little room for merge-heavy maintenance windows;
- the cluster is already constrained by disk bandwidth rather than merge thread count;
- the workload is dominated by mutations, where `number_of_free_entries_in_pool_to_execute_mutation` may need separate treatment.

## Current recommended server config

```
cat /etc/clickhouse-server/config.d/aggresive_merges.xml
<clickhouse>
 <background_pool_size>36</background_pool_size>
 <background_schedule_pool_size>128</background_schedule_pool_size>
 <background_common_pool_size>8</background_common_pool_size>
 <background_merges_mutations_concurrency_ratio>1</background_merges_mutations_concurrency_ratio>
 <merge_tree>
  <number_of_free_entries_in_pool_to_lower_max_size_of_merge>32</number_of_free_entries_in_pool_to_lower_max_size_of_merge>
  <max_replicated_merges_in_queue>36</max_replicated_merges_in_queue>
  <max_bytes_to_merge_at_max_space_in_pool>161061273600</max_bytes_to_merge_at_max_space_in_pool>
  <min_merge_bytes_to_use_direct_io>10737418240</min_merge_bytes_to_use_direct_io> <!-- 0 to disable -->
 </merge_tree>
</clickhouse>
```

## Legacy profile-style example

Only use the `default` profile layout if you are intentionally keeping an older configuration style or a compatibility path. See the version notes at the end of this article before copying it.

```
cat /etc/clickhouse-server/users.d/aggresive_merges.xml
<clickhouse>
<profiles>
<default>
<background_pool_size>36</background_pool_size>
<background_merges_mutations_concurrency_ratio>1</background_merges_mutations_concurrency_ratio>
</default>
</profiles>
</clickhouse>
```

## Version notes

- Through `23.2.x`, ClickHouse read these pool settings from the main config and also fell back to `profiles.default.*` in `Context.cpp`. That older path covered not only `background_pool_size` and `background_merges_mutations_concurrency_ratio`, but also settings such as `background_schedule_pool_size` and `background_common_pool_size`.
- Starting with `23.3.1.2823-lts`, ClickHouse changed this area in PR `#48055` ("Refactor reading the pool setting & from server config"). From that release forward, these settings were documented as server settings and the source marked `background_pool_size` and `background_merges_mutations_concurrency_ratio` as moved to server config.
- For `23.3.1.2823-lts` and later, prefer server config (`config.xml` / `config.d`) for `background_*` settings. This is the layout shown in the main example above.
- `background_pool_size` and `background_merges_mutations_concurrency_ratio` still keep a backward-compatibility path from the `default` profile at server startup in current upstream source and docs. That is why the legacy profile-style example above is limited to those two settings.
- This article intentionally does **not** show `background_schedule_pool_size` or `background_common_pool_size` in `users.d`. Older versions accepted that pattern, but current upstream docs do not document those settings as profile-based compatibility knobs. For current versions, keep them in server config.
