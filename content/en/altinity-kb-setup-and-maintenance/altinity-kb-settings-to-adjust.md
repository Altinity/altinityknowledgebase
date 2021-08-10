---
title: "Settings to adjust"
linkTitle: "Settings to adjust"
description: >
    Settings to adjust
---

1. `query_log` and other `_log` tables - set up TTL, or some other cleanup procedures.

   ```markup
   cat /etc/clickhouse-server/config.d/query_log.xml 
   <yandex>
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
   </yandex>
   ```

2. `query_thread_log` - typically is not useful, you can disable it \(or set up TTL\).

   ```markup
   cat /etc/clickhouse-server/config.d/disable_query_thread_log.xml 
   <yandex>
       <query_thread_log remove="1" />
       <metric_log remove="1" /> 
       <asynchronous_metric_log remove="1" />
       <!-- if you have a good monitoring outside you don't need to store metrics 
       in ClickHouse too -->
   </yandex>
   ```

3. `part_log` - may be nice, especially at the beginning / during system tuning/analyze.

   ```markup
   cat /etc/clickhouse-server/config.d/part_log.xml 
   <yandex>
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
   </yandex>
   ```

4. on older versions `log_queries` is disabled by default, it's worth having it enabled always.

   ```markup
   $ cat /etc/clickhouse-server/users.d/log_queries.xml
   <yandex>
       <profiles>
           <default>
               <log_queries>1</log_queries>
           </default>
       </profiles>
   </yandex>
   ```

5. quite often you want to have on-disk group by / order by enabled \(both disabled by default\).

   ```markup
   cat /etc/clickhouse-server/users.d/enable_on_disk_operations.xml
   <yandex>
       <profiles>                        
           <default>
              <max_bytes_before_external_group_by>2000000000</max_bytes_before_external_group_by>
              <max_bytes_before_external_sort>2000000000</max_bytes_before_external_sort>
           </default>
       </profiles>
   </yandex>
   ```

6. quite often you want to create more users with different limitations.  
   The most typical is `<max_execution_time>`  
   It's actually also not a way to plan/share existing resources better, but it at least disciplines users.

   Also introducing some [restrictions on query complexity](https://clickhouse.tech/docs/en/operations/settings/query-complexity/) can be a good option to discipline users.

   You can find the preset example [here](https://clickhouse.tech/docs/en/operations/settings/settings-profiles/).  
   Also, force\_index\_by\_date + force\_primary\_key can be a nice idea to avoid queries that 'accidentally' do full scans, max\_concurrent\_queries\_for\_user

7. merge\_tree settings: `max_bytes_to_merge_at_max_space_in_pool` \(may be reduced in some scenarios\), `fsync_*` , `inactive_parts_to_throw_insert` - can be enabled, `replicated_deduplication_window` - can be extended if single insert create lot of parts , `merge_with_ttl_timeout` - when you use ttl
8. settings `default_database_engine` / `insert_distributed_sync` / `fsync_metadata` / `do_not_merge_across_partitions_select_final` / fsync
9. memory usage per server / query / user: [memory configuration settings](altinity-kb-memory-configuration-settings.md)

See also:

{% embed url="https://docs.altinity.com/operationsguide/security/clickhouse-hardening-guide/" %}





