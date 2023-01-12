---
title: "Settings to adjust"
linkTitle: "Settings to adjust"
description: >
    Settings to adjust
---
1. `query_log` and other `_log` tables - set up TTL, or some other cleanup procedures.

   ```markup
   cat /etc/clickhouse-server/config.d/query_log.xml
   <clickhouse>
       <query_log replace="1">
           <database>system</database>
           <table>query_log</table>
           <flush_interval_milliseconds>7500</flush_interval_milliseconds>
           <engine>
   ENGINE = MergeTree
   PARTITION BY event_date
   ORDER BY (event_time)
   TTL event_date + interval 90 day
   SETTINGS ttl_only_drop_parts=1
           </engine>
       </query_log>
   </clickhouse>
   ```

2. `query_thread_log` - typically is not too useful for end users, you can disable it (or set up TTL).
    We do not recommend removing this table completely as you might need it for debug one day and the threads' logging can be easily disabled/enabled without a restart through user profiles:

   ```markup
    $ cat /etc/clickhouse-server/users.d/z_log_queries.xml
    <clickhouse>
        <profiles>
            <default>
                <log_query_threads>0</log_query_threads>
            </default>
        </profiles>
    </clickhouse>
   ```

2. If you have a good monitoring outside ClickHouse you don't need to store the history of metrics in ClickHouse

   ```markup
   cat /etc/clickhouse-server/config.d/disable_metric_logs.xml
   <clickhouse>
       <metric_log remove="1" />
       <asynchronous_metric_log remove="1" />
   </clickhouse>
   ```


3. `part_log` - may be nice, especially at the beginning / during system tuning/analyze.

   ```markup
   cat /etc/clickhouse-server/config.d/part_log.xml
   <clickhouse>
       <part_log replace="1">
           <database>system</database>
           <table>part_log</table>
           <flush_interval_milliseconds>7500</flush_interval_milliseconds>
           <engine>
   ENGINE = MergeTree
   PARTITION BY toYYYYMM(event_date)
   ORDER BY (event_time)
   TTL toStartOfMonth(event_date) + INTERVAL 3 MONTH
   SETTINGS ttl_only_drop_parts=1
           </engine>
       </part_log>
   </clickhouse>
   ```

4. on older versions `log_queries` is disabled by default, it's worth having it enabled always.

   ```markup
   $ cat /etc/clickhouse-server/users.d/log_queries.xml
   <clickhouse>
       <profiles>
           <default>
               <log_queries>1</log_queries>
           </default>
       </profiles>
   </clickhouse>
   ```

5. quite often you want to have on-disk group by / order by enabled (both disabled by default).

   ```markup
   cat /etc/clickhouse-server/users.d/enable_on_disk_operations.xml
   <clickhouse>
       <profiles>
           <default>
              <max_bytes_before_external_group_by>2000000000</max_bytes_before_external_group_by>
              <max_bytes_before_external_sort>2000000000</max_bytes_before_external_sort>
           </default>
       </profiles>
   </clickhouse>
   ```

6. quite often you want to create more users with different limitations.
   The most typical is `<max_execution_time>`
   It's actually also not a way to plan/share existing resources better, but it at least disciplines users.

   Also introducing some [restrictions on query complexity](https://clickhouse.tech/docs/en/operations/settings/query-complexity/) can be a good option to discipline users.

   You can find the preset example [here](https://clickhouse.tech/docs/en/operations/settings/settings-profiles/).
   Also, force_index_by_date + force_primary_key can be a nice idea to avoid queries that 'accidentally' do full scans, max_concurrent_queries_for_user

7. merge_tree settings: `max_bytes_to_merge_at_max_space_in_pool` (may be reduced in some scenarios), `inactive_parts_to_throw_insert` - can be enabled, `replicated_deduplication_window` - can be extended if single insert create lot of parts , `merge_with_ttl_timeout` - when you use ttl

8. `insert_distributed_sync` - for small clusters you may sometimes want to enable it
9. when the durability is the main requirement (or server / storage is not stable) - you may want to enable `fsync_*` setting (impacts the write performance significantly!!), and `insert_quorum`

11. If you use FINAL queries - usually you want to enable  `do_not_merge_across_partitions_select_final`

9. memory usage per server / query / user: [memory configuration settings](altinity-kb-memory-configuration-settings.md)

10. if you use async_inserts - you often may want to increase max_concurrent_queries 

```
<clickhouse>
    <max_concurrent_queries>500</max_concurrent_queries>
    <max_concurrent_insert_queries>400</max_concurrent_insert_queries>
    <max_concurrent_select_queries>100</max_concurrent_select_queries>
</clickhouse>
```

See also:

[https://docs.altinity.com/operationsguide/security/clickhouse-hardening-guide/](https://docs.altinity.com/operationsguide/security/clickhouse-hardening-guide/)
