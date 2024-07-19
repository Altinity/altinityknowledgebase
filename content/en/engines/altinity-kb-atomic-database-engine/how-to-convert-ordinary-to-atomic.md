---
title: "How to Convert Ordinary to Atomic"
linkTitle: "How to Convert Ordinary to Atomic"
weight: 100
description: >-
     Clickhouse Howto Convert Ordinary to Atomic
---

## New, official way

* Implemented automatic conversion of database engine from `Ordinary` to `Atomic` (ClickHouse Server 22.8+). Create empty `convert_ordinary_to_atomic` file in `flags` directory and all `Ordinary` databases will be converted automatically on next server start. Resolves [#39546](https://github.com/ClickHouse/ClickHouse/issues/39546). [#39933](https://github.com/ClickHouse/ClickHouse/pull/39933) ([Alexander Tokmakov](https://github.com/tavplubix))

* There can be some problems if the `default` database is Ordinary and fails for some reason. You can add:

```
<clickhouse>
     <allow_reserved_database_name_tmp_convert>1</allow_reserved_database_name_tmp_convert>
</clickhouse>
```
[More detailed info here](https://github.com/ClickHouse/ClickHouse/blob/f01a285f6091265cfae72bb7fbf3186269804891/src/Interpreters/loadMetadata.cpp#L150)

