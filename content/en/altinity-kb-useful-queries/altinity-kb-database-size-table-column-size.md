---
title: "Database Size - Table - Column size"
linkTitle: "Database Size - Table - Column size"
description: >
    Database Size - Table - Column size
---

## Tables

### Table size

```sql
SELECT
    database,
    table,
    formatReadableSize(sum(data_compressed_bytes) AS size) AS compressed,
    formatReadableSize(sum(data_uncompressed_bytes) AS usize) AS uncompressed,
    round(usize / size, 2) AS compr_rate,
    sum(rows) AS rows,
    count() AS part_count
FROM system.parts
WHERE (active = 1) AND (table LIKE '%') AND (database LIKE '%')
GROUP BY
    database,
    table
ORDER BY size DESC;
```

### Column size

```sql
SELECT
    database,
    table,
    column,
    formatReadableSize(sum(column_data_compressed_bytes) AS size) AS compressed,
    formatReadableSize(sum(column_data_uncompressed_bytes) AS usize) AS uncompressed,
    round(usize / size, 2) AS compr_rate
FROM system.parts_columns
WHERE (active = 1) AND (table LIKE 'query_log')
GROUP BY
    database,
    table,
    column
ORDER BY size DESC;
```

## Projections

### Projection size

```sql
SELECT
    database,
    table,
    name,
    formatReadableSize(sum(data_compressed_bytes) AS size) AS compressed,
    formatReadableSize(sum(data_uncompressed_bytes) AS usize) AS uncompressed,
    round(usize / size, 2) AS compr_rate,
    sum(rows) AS rows,
    count() AS part_count
FROM system.projection_parts
WHERE (table = 'ptest') AND active
GROUP BY
    database,
    table,
    name
ORDER BY size DESC;
```

### Projection column size

```sql
SELECT
    database,
    table,
    column,
    formatReadableSize(sum(column_data_compressed_bytes) AS size) AS compressed,
    formatReadableSize(sum(column_data_uncompressed_bytes) AS usize) AS uncompressed,
    round(usize / size, 2) AS compr_rate
FROM system.projection_parts_columns
WHERE (active = 1) AND (table LIKE 'ptest')
GROUP BY
    database,
    table,
    column
ORDER BY size DESC;
```

© 2021 Altinity Inc. All rights reserved.

