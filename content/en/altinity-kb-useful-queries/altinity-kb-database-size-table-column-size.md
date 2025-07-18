---
title: "Database Size - Table - Column size"
linkTitle: "Database Size - Table - Column size"
description: >
    Database Size - Table - Column size
keywords:
  - clickhouse database size
  - clickhouse table size
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
WHERE (active = 1) AND (database LIKE '%') AND (table LIKE '%')
GROUP BY
    database,
    table
ORDER BY size DESC;
```

### Table size + inner MatView (Atomic)

```sql
SELECT
      p.database,
      if(t.name = '', p.table, p.table||' ('||t.name||')') tbl,
      formatReadableSize(sum(p.data_compressed_bytes) AS size) AS compressed,
      formatReadableSize(sum(p.data_uncompressed_bytes) AS usize) AS uncompressed,
      round(usize / size, 2) AS compr_rate,
      sum(p.rows) AS rows,
      count() AS part_count
FROM system.parts p left join system.tables t on p.database = t.database and p.table = '.inner_id.'||toString(t.uuid)
WHERE (active = 1) AND (tbl LIKE '%') AND (database LIKE '%')
GROUP BY
    p.database,
    tbl
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
    round(usize / size, 2) AS compr_ratio,
    sum(rows) rows_cnt,
    round(usize / rows_cnt, 2) avg_row_size
FROM system.parts_columns
WHERE (active = 1) AND (database LIKE '%') AND (table LIKE '%')
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

```sql
SELECT
   count(),
   * APPLY (uniq),
   * APPLY (max),
   * APPLY (min),
   * APPLY(topK(5))
FROM table_name 
FORMAT Vertical;

-- also you can add * APPLY (entropy) to show entropy (i.e. 'randomness' of the column).
-- if the table is huge add some WHERE condition to slice some 'representative' data range, for example single month / week / day of data.
```

## Understanding the ingest pattern:

```sql
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

## part_log

```sql
WITH 30 * 60 AS frame_size
SELECT
    toStartOfInterval(event_time, toIntervalSecond(frame_size)) AS m,
    database,
    table,
    ROUND(countIf(event_type = 'NewPart') / frame_size, 2) AS new,
    ROUND(countIf(event_type = 'MergeParts') / frame_size, 2) AS merge,
    ROUND(countIf(event_type = 'DownloadPart') / frame_size, 2) AS dl,
    ROUND(countIf(event_type = 'RemovePart') / frame_size, 2) AS rm,
    ROUND(countIf(event_type = 'MutatePart') / frame_size, 2) AS mut,
    ROUND(countIf(event_type = 'MovePart') / frame_size, 2) AS mv
FROM system.part_log
WHERE event_time > (now() - toIntervalHour(24))
GROUP BY
    m,
    database,
    table
ORDER BY
    database ASC,
    table ASC,
    m ASC
    
WITH 30 * 60 AS frame_size
SELECT
    toStartOfInterval(event_time, toIntervalSecond(frame_size)) AS m,
    database,
    table,
    ROUND(countIf(event_type = 'NewPart') / frame_size, 2) AS inserts_per_sec,
    ROUND(sumIf(rows, event_type = 'NewPart') / frame_size, 2) AS rows_per_sec,
    ROUND(sumIf(size_in_bytes, event_type = 'NewPart') / frame_size, 2) AS bytes_per_sec
FROM system.part_log
WHERE event_time > (now() - toIntervalHour(24))
GROUP BY
    m,
    database,
    table
ORDER BY
    database ASC,
    table ASC,
    m ASC
```               


## Understanding the partitioning

```sql
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

## Subcolumns sizes 

```sql
WITH 
     if(
          length(subcolumns.names) > 0, 
          arrayMap( (sc_n,sc_t,sc_s, sc_bod, sc_dcb, sc_dub) -> tuple(sc_n,sc_t,sc_s, sc_bod, sc_dcb, sc_dub), subcolumns.names, subcolumns.types, subcolumns.serializations, subcolumns.bytes_on_disk, subcolumns.data_compressed_bytes, subcolumns.data_uncompressed_bytes),
          [tuple('',type,serialization_kind,column_bytes_on_disk,column_data_compressed_bytes,column_data_uncompressed_bytes)]) as _subcolumns_data,
     arrayJoin(_subcolumns_data) as _subcolumn,
     _subcolumn.1 as _sc_name, 
     _subcolumn.2 as _sc_type,
     _subcolumn.3 as _sc_serialization,
     _subcolumn.4 as _sc_bytes_on_disk,
     _subcolumn.5 as _sc_data_compressed_bytes,
     _subcolumn.6 as _sc_uncompressed_bytes
SELECT
    database || '.' || table as table_,
    column as colunm_, 
    _sc_name as subcolumn_,
    any(_sc_type),
    formatReadableSize(sum(_sc_data_compressed_bytes) AS size) AS compressed,
    formatReadableSize(sum(_sc_uncompressed_bytes) AS usize) AS uncompressed,
    round(usize / size, 2) AS compr_ratio,
    sum(rows) AS rows_cnt,
    round(usize / rows_cnt, 2) AS avg_row_size
FROM system.parts_columns
WHERE (active = 1) AND (database LIKE '%') AND (`table` LIKE '%)
GROUP BY  
     table_,
     colunm_,
     subcolumn_
ORDER BY size DESC ;
```

