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
 
## Understanding the columns data properties:

```
SELECT count(), * APPLY (uniq), * APPLY (max), * APPLY (min), * APPLY(topK(5)) FROM table_name FORMAT Vertical;

# also you can add * APPLY (entropy) to show entropy (i.e. 'randomness' of the column).
```

## Understanding the ingest pattern:

```
SELECT
    database,
    table,
    median(rows),
    median(bytes_on_disk),
    sum(rows),
    max(bytes_on_disk),
    min(bytes_on_disk),
    round(quantile(0.95)(bytes_on_disk), 0),
    sum(bytes_on_disk),
    count(),
    countIf(NOT active),
    uniqExact(partition)
FROM system.parts
WHERE (modification_time > (now() - 480)) AND (level = 0)
GROUP BY
    database,
    table
ORDER BY count() DESC
```

## Understanding the partitioning

```
SELECT
    database,
    table,
    count(),
    topK(5)(partition),
    COLUMNS('metric.*') APPLY(quantiles(0.005, 0.05, 0.10, 0.25, 0.5, 0.75, 0.9, 0.95, 0.995))
FROM
(
    SELECT
        database,
        table,
        partition,
        sum(bytes_on_disk) AS metric_bytes,
        sum(data_uncompressed_bytes) AS metric_uncompressed_bytes,
        sum(rows) AS metric_rows,
        sum(primary_key_bytes_in_memory) AS metric_pk_size,
        count() AS metric_count,
        countIf(part_type = 'Wide') AS metric_wide_count,
        countIf(part_type = 'Compact') AS metric_compact_count,
        countIf(part_type = 'Memory') AS metric_memory_count
    FROM system.parts
    GROUP BY
        database,
        table,
        partition
)
GROUP BY
    database,
    table
FORMAT Vertical
```
