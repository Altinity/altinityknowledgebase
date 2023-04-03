---
title: "PIVOT / UNPIVOT"
linkTitle: "PIVOT / UNPIVOT"
description: >
    PIVOT / UNPIVOT
---
## PIVOT

```sql
CREATE TABLE sales(suppkey UInt8, category String, quantity UInt32) ENGINE=Memory(); 

INSERT INTO sales VALUES (2, 'AA' ,7500),(1, 'AB' , 4000),(1, 'AA' , 6900),(1, 'AB', 8900), (1, 'AC', 8300), (1, 'AA', 7000), (1, 'AC', 9000), (2,'AA', 9800), (2,'AB', 9600), (1,'AC', 8900),(1, 'AD', 400), (2,'AD', 900), (2,'AD', 1200), (1,'AD', 2600), (2, 'AC', 9600),(1, 'AC', 6200);
```

### Using Map data type (starting from Clickhouse 21.1)

```sql
WITH CAST(sumMap([category], [quantity]), 'Map(String, UInt32)') AS map
SELECT
    suppkey,
    map['AA'] AS AA,
    map['AB'] AS AB,
    map['AC'] AS AC,
    map['AD'] AS AD
FROM sales
GROUP BY suppkey
ORDER BY suppkey ASC

┌─suppkey─┬────AA─┬────AB─┬────AC─┬───AD─┐
│       1 │ 13900 │ 12900 │ 32400 │ 3000 │
│       2 │ 17300 │  9600 │  9600 │ 2100 │
└─────────┴───────┴───────┴───────┴──────┘

WITH CAST(sumMap(map(category, quantity)), 'Map(LowCardinality(String), UInt32)') AS map
SELECT
    suppkey,
    map['AA'] AS AA,
    map['AB'] AS AB,
    map['AC'] AS AC,
    map['AD'] AS AD
FROM sales
GROUP BY suppkey
ORDER BY suppkey ASC

┌─suppkey─┬────AA─┬────AB─┬────AC─┬───AD─┐
│       1 │ 13900 │ 12900 │ 32400 │ 3000 │
│       2 │ 17300 │  9600 │  9600 │ 2100 │
└─────────┴───────┴───────┴───────┴──────┘
```

### Using -If combinator

```sql
SELECT
    suppkey,
    sumIf(quantity, category = 'AA') AS AA,
    sumIf(quantity, category = 'AB') AS AB,
    sumIf(quantity, category = 'AC') AS AC,
    sumIf(quantity, category = 'AD') AS AD
FROM sales
GROUP BY suppkey
ORDER BY suppkey ASC

┌─suppkey─┬────AA─┬────AB─┬────AC─┬───AD─┐
│       1 │ 13900 │ 12900 │ 32400 │ 3000 │
│       2 │ 17300 │  9600 │  9600 │ 2100 │
└─────────┴───────┴───────┴───────┴──────┘
```

### Using -Resample combinator

```sql
WITH sumResample(0, 4, 1)(quantity, transform(category, ['AA', 'AB', 'AC', 'AD'], [0, 1, 2, 3], 4)) AS sum
SELECT
    suppkey,
    sum[1] AS AA,
    sum[2] AS AB,
    sum[3] AS AC,
    sum[4] AS AD
FROM sales
GROUP BY suppkey
ORDER BY suppkey ASC

┌─suppkey─┬────AA─┬────AB─┬────AC─┬───AD─┐
│       1 │ 13900 │ 12900 │ 32400 │ 3000 │
│       2 │ 17300 │  9600 │  9600 │ 2100 │
└─────────┴───────┴───────┴───────┴──────┘
```

## UNPIVOT

```sql
CREATE TABLE sales_w(suppkey UInt8, brand String, AA UInt32, AB UInt32, AC UInt32,
AD UInt32) ENGINE=Memory();

 INSERT INTO sales_w VALUES (1, 'BRAND_A', 1500, 4200, 1600, 9800), (2, 'BRAND_B', 6200, 1300, 5800, 3100), (3, 'BRAND_C', 5000, 8900, 6900, 3400);
```

```sql
SELECT
    suppkey,
    brand,
    category,
    quantity
FROM sales_w
ARRAY JOIN
    [AA, AB, AC, AD] AS quantity,
    splitByString(', ', 'AA, AB, AC, AD') AS category
ORDER BY suppkey ASC

┌─suppkey─┬─brand───┬─category─┬─quantity─┐
│       1 │ BRAND_A │ AA       │     1500 │
│       1 │ BRAND_A │ AB       │     4200 │
│       1 │ BRAND_A │ AC       │     1600 │
│       1 │ BRAND_A │ AD       │     9800 │
│       2 │ BRAND_B │ AA       │     6200 │
│       2 │ BRAND_B │ AB       │     1300 │
│       2 │ BRAND_B │ AC       │     5800 │
│       2 │ BRAND_B │ AD       │     3100 │
│       3 │ BRAND_C │ AA       │     5000 │
│       3 │ BRAND_C │ AB       │     8900 │
│       3 │ BRAND_C │ AC       │     6900 │
│       3 │ BRAND_C │ AD       │     3400 │
└─────────┴─────────┴──────────┴──────────┘

SELECT
    suppkey,
    brand,
    tpl.1 AS category,
    tpl.2 AS quantity
FROM sales_w
ARRAY JOIN tupleToNameValuePairs(CAST((AA, AB, AC, AD), 'Tuple(AA UInt32, AB UInt32, AC UInt32, AD UInt32)')) AS tpl
ORDER BY suppkey ASC

┌─suppkey─┬─brand───┬─category─┬─quantity─┐
│       1 │ BRAND_A │ AA       │     1500 │
│       1 │ BRAND_A │ AB       │     4200 │
│       1 │ BRAND_A │ AC       │     1600 │
│       1 │ BRAND_A │ AD       │     9800 │
│       2 │ BRAND_B │ AA       │     6200 │
│       2 │ BRAND_B │ AB       │     1300 │
│       2 │ BRAND_B │ AC       │     5800 │
│       2 │ BRAND_B │ AD       │     3100 │
│       3 │ BRAND_C │ AA       │     5000 │
│       3 │ BRAND_C │ AB       │     8900 │
│       3 │ BRAND_C │ AC       │     6900 │
│       3 │ BRAND_C │ AD       │     3400 │
└─────────┴─────────┴──────────┴──────────┘
```

