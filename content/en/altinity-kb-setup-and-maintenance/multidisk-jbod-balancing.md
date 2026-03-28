---
title: "MultiDisk (JBOD) Balancing"
linkTitle: "MultiDisk (JBOD) Balancing"
---

ClickHouse provides two options to balance an insert across disks in a volume with more than one disk: `round_robin` and `least_used` .

## **Round Robin (Default):**

ClickHouse selects the next disk in a round robin manner to write each part created.

This is the default setting and is most effective when parts created on insert are roughly the same size.

Drawbacks: may lead to disk skew

## **Least Used:**

ClickHouse selects the disk with the most available space and writes to that disk.

Changing to least_used when even disk space consumption is desirable or when you have a JBOD volume with differing disk sizes. To prevent hot-spots, it is best to set this policy on a fresh volume or on a volume that has already been (re)balanced.

Drawbacks:  may lead to hot-spots

## Configurations

Configurations that can affect disk selected:

- storage policy volume configuration: `least_used_ttl_ms`. Only applies to `least_used` policy, 60s default.
- disk setting: `keep_free_space_bytes` , `keep_free_space_ratio`

Configuration to assist rebalancing:

- MergeTree setting: `min_bytes_to_rebalance_partition_over_jbod`. Setting is not about where the data is written on insert. This setting considers redistribution of parts across disks of the same volume on a merge.

> Note: setting `min_bytes_to_rebalance_partition_over_jbod` does not guarantee balanced partitions and balanced disk usage.
>

Example of least_used policy:

```xml
<clickhouse>
  <storage_configuration>
    <disks>
     <default>
       <path>/var/lib/clickhouse/</path>
        <keep_free_space_bytes>10737418240</keep_free_space_bytes>
      </disk1>
      <disk1>
        <path>/mnt/disk1/</path>
        <keep_free_space_bytes>10737418240</keep_free_space_bytes>
      </disk1>
      <disk2>
        <path>/mnt/disk2/</path>
        <keep_free_space_bytes>10737418240</keep_free_space_bytes>
      </disk2>
    </disks>
    <policies>
      <hot>
        <volumes>
          <default>
            <disk>disk1</disk>
            <disk>disk2</disk>
            <load_balancing>least_used</load_balancing>
            <least_used_ttl_ms>60000</least_used_ttl_ms> <!-- 60s -->
          </default>
        </volumes>
      </hot>
    </policies>
  </storage_configuration>
</clickhouse>
```

## Manual Rebalancing Parts over JBOD Disks

```sql
WITH
    '%' AS target_tables,
    '%' AS target_databases
SELECT sub.q FROM 
( 
    SELECT
        'ALTER TABLE ' || parts.database || '.' || parts.`table` || ' MOVE PART \'' || parts.name ||'\' TO DISK \'' || other_disk_candidate || '\';' as q,
        parts.database as db,
        parts.`table` as t,
        parts.name as part_name,
        parts.disk_name as part_disk_name,
        parts.bytes_on_disk AS part_bytes_on_disk,
        sp.storage_policy as part_storage_policy,
        arrayJoin(arrayRemove(v.disks, parts.disk_name)) AS other_disk_candidate,
        candidate_disks.free_space AS candidate_disk_free_space
    FROM system.parts AS parts
    INNER JOIN ( SELECT database, `table`, storage_policy FROM system.tables where (name LIKE target_tables) AND (database LIKE target_databases) group by 1, 2, 3 ) AS sp ON sp.`table` = parts.`table` AND sp.database = parts.database 
    INNER JOIN ( SELECT policy_name, volume_name, disks AS disks FROM system.storage_policies WHERE volume_type = 0 ) AS v ON sp.storage_policy = v.policy_name
    INNER JOIN ( SELECT name, free_space FROM system.disks ORDER BY free_space DESC ) AS candidate_disks ON candidate_disks.name = other_disk_candidate
    WHERE parts.active = 1 
        AND (parts.bytes_on_disk >= 10737418240) --10GB prioritize larger parts
        AND (parts.`table` LIKE target_tables) 
        AND (parts.database LIKE target_databases)
        AND candidate_disks.free_space > parts.bytes_on_disk*2 -- 2x buffer
    ORDER BY parts.bytes_on_disk DESC, candidate_disk_free_space DESC
    LIMIT 1 BY db, t, part_name
) as sub
FORMAT TSVRaw
```
