### Aggressive merges

> Hi, our production cluster is made of pretty beefy machines (36 cores, 1TB of RAM, large NVMe disks). I would like to find out what settings I can to make merging parts more efficient. right now my biggest table ends up being 3,000 parts big after I finish my 80 min ingestion, and it takes something like 4 hours for it to come down to its final state of ~20 parts.
> 
> 
> Is there any way I can dedicate more resources to merging parts?
> 

Mostly you do that by changing the level of parallelism:

1) `background_pool_size` - how many threads will be actually doing the merge (if you can push all the server resources to do the merges, i.e. no selects will be running - you can give all the cores to that, so try increasing to 36). If you use replicated table - use the same value for `max_replicated_merges_in_queue`.

2) `background_merges_mutations_concurrency_ratio` - how many merges will be assigned (multiplier of background_pool_size), sometimes the default (2) may work against you since it will assign smaller merges, which is nice if you need to deal with realtime inserts, but is not important it you do bulk inserts and later start a lot of merges. So i would try 1.

3) (merge_tree setting) `number_of_free_entries_in_pool_to_lower_max_size_of_merge` should be changed together with background_pool_size (50-90% of that). "When there is less than a specified number of free entries in the pool (or replicated queue), start to lower the maximum size of the merge to process (or to put in the queue). This is to allow small merges to process - not filling the pool with long-running merges." . To make it really aggressive try 90-95% of background_pool_size, for ex. 34 (so you will have 34 huge merges, and 2 small ones).

Additionally, you can:

1. control how big target parts will be created by the merges (max_bytes_to_merge_at_max_space_in_pool)
2. disable direct io for big merges (min_merge_bytes_to_use_direct_io) - direct io is often slower (it bypasses the page cache, and it is used there to prevent pushing out the often used data from the cache by the running merge).
3. on a replicated system with slow merges and a fast network you can use execute_merges_on_single_replica_time_threshold
4. analyze if vertical or horizontal merge is better / faster for your case/schema. (Vertical first merges the columns from the table ORDER BY and then other columns one by another - that normally requires less ram, and keep fewer files opened, but is more complex compared to horizontal when all columns are merged simultaneously).
5. if you have a lot of tables - you can give also give more resources to the scheduler (the component which assigns the merges, and do some housekeeping) - background_schedule_pool_size & background_common_pool_size
6. review the schema, especially codes/compression used (they allow to reduce the size, but often can impact the merge speed significantly).
7. try to form bigger parts when doing inserts (min_insert_block_size_bytes / min_insert_block_size_rows / max_insert_block_size)
8. check if wide (every column in a separate file) or compact (columns are mixed in one file) parts are used (system.parts). By default min_bytes_for_wide_part=10 mln rows (so if the part is bigger that that the wide format will be used, compact otherwise). Sometimes it can be beneficial to use a compact format even for bigger parts (a lot of relatively small columns) or oppositely - use a wide format even for small parts (few fat columns in the table).
9. consider using recent clickhouse releases - they use compressed marks by default, which can be beneficial for reducing the i/o

All the adjustments/performance optimizations should be controlled by some reproducible 'benchmark' so you can control/prove that the change gives the expected result (sometimes it's quite hard to predict the impact of some change on the real system). Please also monitors how system resources (especially CPU, IO + for replicated tables: network & zookeeper) are used/saturated during the test. Also monitor/plot the usage of the pools:
```
select * from system.metrics where metric like '%PoolTask'
```

Those recommendations are NOT generic. For systems with real-time insert & select pressure happening together with merges - those adjustments can be 'too aggressive'. So if you have different setups with different usage patterns - avoid using the same 'aggressive' settings template for all of them.

TL/DR version:

```
/etc/clickhouse-server/config.d/aggresive_merges.xml
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

/etc/clickhouse-server/users.d/aggresive_merges.xml
<clickhouse> <!-- on 22.8 that should be adjusted in both places - default profile and main config -->
<profiles>
<default>
<background_pool_size>36</background_pool_size>
<background_schedule_pool_size>128</background_schedule_pool_size>
<background_common_pool_size>8</background_common_pool_size>
<background_merges_mutations_concurrency_ratio>1</background_merges_mutations_concurrency_ratio>
</default>
</profiles>
</clickhouse>
```

