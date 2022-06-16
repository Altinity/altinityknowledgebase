---
title: "S3Disk"
linkTitle: "S3Disk"
weight: 100
description: >-
     
---

## Settings

```xml
<clickhouse>
  <storage_configuration>
    <disks>
      <s3>
        <type>s3</type>
        <endpoint>http://s3.us-east-1.amazonaws.com/BUCKET_NAME/test_s3_disk/</endpoint>
        <access_key_id>ACCESS_KEY_ID</access_key_id>
        <secret_access_key>SECRET_ACCESS_KEY</secret_access_key>
        <skip_access_check>true</skip_access_check>
        <send_metadata>true</send_metadata>
      </s3>
    </disks>
  </storage_configuration>
</clickhouse>
```

* skip_access_check — if true, it's possible to use read only credentials with regular MergeTree table. But you would need to disable merges (`prefer_not_to_merge` setting) on s3 volume as well.

* send_metadata — if true, ClickHouse will populate s3 object with initial part & file path, which allow you to recover metadata from s3 and make debug easier.


## Restore metadata from S3

### Default

Limitations:
1. ClickHouse need RW access to this bucket

In order to restore metadata, you would need to create restore file in `metadata_path/_s3_disk_name_` directory:

```bash
touch /var/lib/clickhouse/disks/_s3_disk_name_/restore
```

In that case ClickHouse would restore to the same bucket and path and update only metadata files in s3 bucket.

### Custom

Limitations:
1. ClickHouse needs RO access to the old bucket and RW to the new.
2. ClickHouse will copy objects in case of restoring to a different bucket or path.
 
If you would like to change bucket or path, you need to populate restore file with settings in key=value format:

```bash
cat /var/lib/clickhouse/disks/_s3_disk_name_/restore

source_bucket=s3disk
source_path=vol1/
```

## Links

https://altinity.com/blog/integrating-clickhouse-with-minio
https://altinity.com/blog/clickhouse-object-storage-performance-minio-vs-aws-s3
https://altinity.com/blog/tips-for-high-performance-clickhouse-clusters-with-s3-object-storage
