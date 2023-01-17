---
title: "Moving a table to another device."
linkTitle: "Moving a table to another device."
description: >
    Moving a table to another device.
---
Suppose we mount a new device at path `/mnt/disk_1` and want to move `table_4` to it.

1. Create directory on new device for ClickHouse data. /in shell `mkdir /mnt/disk_1/clickhouse`
2. Change ownership of created directory to ClickHouse user. /in shell `chown -R clickhouse:clickhouse /mnt/disk_1/clickhouse`
3. Create a special storage policy which should include both disks: old and new. /in shell

```markup
nano /etc/clickhouse-server/config.d/storage.xml
###################/etc/clickhouse-server/config.d/storage.xml###########################
<yandex>
  <storage_configuration>
    <disks>
      <!--
          default disk is special, it always
          exists even if not explicitly
          configured here, but you can't change
          it's path here (you should use <path>
          on top level config instead)
      -->
      <default>
         <!--
             You can reserve some amount of free space
             on any disk (including default) by adding
             keep_free_space_bytes tag
         -->
      </default>
      <disk_1> <!-- disk name -->
          <path>/mnt/disk_1/clickhouse/</path>
      </disk_1>
    </disks>
    <policies>
      <move_from_default_to_disk_1> <!-- name for new storage policy -->
        <volumes>
          <default>
            <disk>default</disk>
            <max_data_part_size_bytes>10000000</max_data_part_size_bytes>
          </default>
          <disk_1_vol> <!-- name of volume -->
            <!--
                we have only one disk in that volume
                and we reference here the name of disk
                as configured above in <disks> section
            -->
            <disk>disk_1</disk>
          </disk_1_vol>
        </volumes>
        <move_factor>0.99</move_factor>
      </move_from_default_to_disk_1>
    </policies>
  </storage_configuration>
</yandex>
#########################################################################################
```

1. Update storage_policy setting of tables to new policy.

```sql
ALTER TABLE table_4 MODIFY SETTING storage_policy='move_from_default_to_disk_1';
```

1. Wait till all parts of tables change their disk_name to new disk.

```sql
SELECT name,disk_name, path from system.parts WHERE table='table_4' and active;
SELECT disk_name, path, sum(rows), sum(bytes_on_disk), uniq(partition), count() FROM system.parts WHERE table='table_4' and active GROUP BY disk_name, path ORDER BY disk_name, path;
```

1. Remove 'default' disk from new storage policy.  In server shell:

```markup
nano /etc/clickhouse-server/config.d/storage.xml
###################/etc/clickhouse-server/config.d/storage.xml###########################
<yandex>
  <storage_configuration>
    <disks>
      <!--
          default disk is special, it always
          exists even if not explicitly
          configured here, but you can't change
          it's path here (you should use <path>
          on top level config instead)
      -->
      <default>
         <!--
             You can reserve some amount of free space
             on any disk (including default) by adding
             keep_free_space_bytes tag
         -->
      </default>
      <disk_1> <!-- disk name -->
          <path>/mnt/disk_1/clickhouse/</path>
      </disk_1>
    </disks>
    <policies>
      <move_from_default_to_disk_1> <!-- name for new storage policy -->
        <volumes>
          <disk_1_vol> <!-- name of volume -->
            <!--
                we have only one disk in that volume
                and we reference here the name of disk
                as configured above in <disks> section
            -->
            <disk>disk_1</disk>
          </disk_1_vol>
        </volumes>
        <move_factor>0.99</move_factor>
      </move_from_default_to_disk_1>
    </policies>
  </storage_configuration>
</yandex>
#########################################################################################
```

ClickHouse wouldn't auto reload config, because we removed some disks from storage policy, so we need to restart it by hand.

1. Restart ClickHouse server.
2. Make sure that storage policy uses the right disks.

```sql
SELECT * FROM system.storage_policies WHERE policy_name='move_from_default_to_disk_1';
```
