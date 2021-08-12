---
title: "PIVOT / UNPIVOT"
linkTitle: "PIVOT / UNPIVOT"
description: >
    PIVOT / UNPIVOT
---
## PIVOT

```sql
CREATE OR REPLACE TABLE monthly_sales(empid INT, amount INT, month TEXT) ENGINE=Memory();

INSERT INTO monthly_sales VALUES
(1, 10000, 'JAN'),(1, 400, 'JAN'),(2, 4500, 'JAN'),(2, 35000, 'JAN'), (1, 5000, 'FEB'),
(1, 3000, 'FEB'), (2, 200, 'FEB'), (2, 90500, 'FEB'), (1, 6000, 'MAR'), (1, 5000, 'MAR'),
(2, 2500, 'MAR'), (2, 9500, 'MAR'), (1, 8000, 'APR'), (1, 10000, 'APR'), (2, 800, 'APR'),
(2, 4500, 'APR');
```

```sql
SET allow_experimental_map_type=1;

WITH CAST(sumMap([month], [amount]), 'Map(String, UInt32)') AS map
SELECT
    empid,
    map['JAN'] AS JAN,
    map['FEB'] AS FEB,
    map['MAR'] AS MAR,
    map['APR'] AS APR
FROM monthly_sales
GROUP BY empid
ORDER BY empid ASC

┌─empid─┬───JAN─┬───FEB─┬───MAR─┬───APR─┐
│     1 │ 10400 │  8000 │ 11000 │ 18000 │
│     2 │ 39500 │ 90700 │ 12000 │  5300 │
└───────┴───────┴───────┴───────┴───────┘
```

```sql
SELECT
    empid,
    sumIf(amount, month = 'JAN') AS JAN,
    sumIf(amount, month = 'FEB') AS FEB,
    sumIf(amount, month = 'MAR') AS MAR,
    sumIf(amount, month = 'APR') AS APR
FROM monthly_sales
GROUP BY empid
ORDER BY empid ASC

┌─empid─┬───JAN─┬───FEB─┬───MAR─┬───APR─┐
│     1 │ 10400 │  8000 │ 11000 │ 18000 │
│     2 │ 39500 │ 90700 │ 12000 │  5300 │
└───────┴───────┴───────┴───────┴───────┘
```

## UNPIVOT

```sql
CREATE OR REPLACE TABLE monthly_sales(empid INT, dept TEXT, jan INT, feb INT, mar INT,
april INT) ENGINE=Memory();

INSERT INTO monthly_sales VALUES (1, 'electronics', 100, 200, 300, 100),
(2, 'clothes', 100, 300, 150, 200),(3, 'cars', 200, 400, 100, 50);
```

```sql
SELECT
    empid,
    dept,
    month,
    sales
FROM monthly_sales
ARRAY JOIN
    [jan, feb, mar, april] AS sales,
    splitByString(', ', 'jan, feb, mar, april') AS month
ORDER BY empid ASC

┌─empid─┬─dept────────┬─month─┬─sales─┐
│     1 │ electronics │ jan   │   100 │
│     1 │ electronics │ feb   │   200 │
│     1 │ electronics │ mar   │   300 │
│     1 │ electronics │ april │   100 │
│     2 │ clothes     │ jan   │   100 │
│     2 │ clothes     │ feb   │   300 │
│     2 │ clothes     │ mar   │   150 │
│     2 │ clothes     │ april │   200 │
│     3 │ cars        │ jan   │   200 │
│     3 │ cars        │ feb   │   400 │
│     3 │ cars        │ mar   │   100 │
│     3 │ cars        │ april │    50 │
└───────┴─────────────┴───────┴───────┘
```
