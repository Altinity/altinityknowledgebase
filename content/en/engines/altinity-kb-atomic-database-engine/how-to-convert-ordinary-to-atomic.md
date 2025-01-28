---
title: "How to Convert Ordinary to Atomic"
linkTitle: "How to Convert Ordinary to Atomic"
weight: 100
---

## New, official way

* Implemented automatic conversion of database engine from `Ordinary` to `Atomic` (ClickHouse® Server 22.8+). Create empty `convert_ordinary_to_atomic` file in `flags` directory and all `Ordinary` databases will be converted automatically on next server start.
* The conversion is not automatic between upgrades, you need to set the flag as explained below:
```
Warnings:
 * Server has databases (for example `test`) with Ordinary engine, which was deprecated. To convert this database to the new Atomic engine, create a flag /var/lib/clickhouse/flags/convert_ordinary_to_atomic and make sure that ClickHouse has write permission for it.
Example: sudo touch '/var/lib/clickhouse/flags/convert_ordinary_to_atomic' && sudo chmod 666 '/var/lib/clickhouse/flags/convert_ordinary_to_atomic'
```  
* Resolves [#39546](https://github.com/ClickHouse/ClickHouse/issues/39546). [#39933](https://github.com/ClickHouse/ClickHouse/pull/39933) ([Alexander Tokmakov](https://github.com/tavplubix))

* There can be some problems if the `default` database is Ordinary and fails for some reason. You can add:

```
<clickhouse>
     <allow_reserved_database_name_tmp_convert>1</allow_reserved_database_name_tmp_convert>
</clickhouse>
```
[More detailed info here](https://github.com/ClickHouse/ClickHouse/blob/f01a285f6091265cfae72bb7fbf3186269804891/src/Interpreters/loadMetadata.cpp#L150)

Don't forget to remove detached parts from all Ordinary databases, or you can get the error:
```
│ 2025.01.28 11:34:57.510330 [ 7 ] {} <Error> Application: Code: 219. DB::Exception: Cannot drop: filesystem error: in remove: Directory not empty ["/var/lib/clickhouse/data/db/"]. Probably data │
│ base contain some detached tables or metadata leftovers from Ordinary engine. If you want to remove all data anyway, try to attach database back and drop it again with enabled force_remove_data_recursively_ │
```

