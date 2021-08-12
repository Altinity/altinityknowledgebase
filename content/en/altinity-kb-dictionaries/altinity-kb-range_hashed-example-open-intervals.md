---
title: "range_hashed example - open intervals"
linkTitle: "range_hashed example - open intervals"
description: >
    range_hashed example - open intervals
---
The following example shows a `range_hashed` example at open intervals.

```sql
DROP TABLE IF EXISTS rates;

DROP DICTIONARY IF EXISTS rates_dict;

CREATE TABLE rates (
  id UInt64,
  date_start Nullable(Date),
  date_end Nullable(Date),
  rate Decimal64(4)
) engine=Log;

INSERT INTO rates VALUES (1, Null, '2021-03-13',99), (1, '2021-03-14','2021-03-16',100), (1, '2021-03-17', Null, 101), (2, '2021-03-14', Null, 200), (3, Null, '2021-03-14', 300), (4, '2021-03-14', '2021-03-14', 400);

CREATE DICTIONARY rates_dict
(
  id UInt64,
  date_start Date,
  date_end Date,
  rate Decimal64(4)
)
PRIMARY KEY id
SOURCE(CLICKHOUSE(HOST 'localhost' PORT 9000 USER 'default' TABLE 'rates'))
LIFETIME(MIN 1 MAX 1000)
LAYOUT(RANGE_HASHED())
RANGE(MIN date_start MAX date_end);

SELECT * FROM rates_dict order by id, date_start;

┌─id─┬─date_start─┬───date_end─┬─────rate─┐
│  1 │ 1970-01-01 │ 2021-03-13 │  99.0000 │
│  1 │ 2021-03-14 │ 2021-03-16 │ 100.0000 │
│  1 │ 2021-03-17 │ 1970-01-01 │ 101.0000 │
│  2 │ 2021-03-14 │ 1970-01-01 │ 200.0000 │
│  3 │ 1970-01-01 │ 2021-03-14 │ 300.0000 │
│  4 │ 2021-03-14 │ 2021-03-14 │ 400.0000 │
└────┴────────────┴────────────┴──────────┘

WITH
  toDate('2021-03-10') + INTERVAL number DAY as date
select
  date,
  dictGet(currentDatabase() || '.rates_dict', 'rate', toUInt64(1), date) as rate1,
  dictGet(currentDatabase() || '.rates_dict', 'rate', toUInt64(2), date) as rate2,
  dictGet(currentDatabase() || '.rates_dict', 'rate', toUInt64(3), date) as rate3,
  dictGet(currentDatabase() || '.rates_dict', 'rate', toUInt64(4), date) as rate4
FROM numbers(10);

┌───────date─┬────rate1─┬────rate2─┬────rate3─┬────rate4─┐
│ 2021-03-10 │  99.0000 │   0.0000 │ 300.0000 │   0.0000 │
│ 2021-03-11 │  99.0000 │   0.0000 │ 300.0000 │   0.0000 │
│ 2021-03-12 │  99.0000 │   0.0000 │ 300.0000 │   0.0000 │
│ 2021-03-13 │  99.0000 │   0.0000 │ 300.0000 │   0.0000 │
│ 2021-03-14 │ 100.0000 │ 200.0000 │ 300.0000 │ 400.0000 │
│ 2021-03-15 │ 100.0000 │ 200.0000 │   0.0000 │   0.0000 │
│ 2021-03-16 │ 100.0000 │ 200.0000 │   0.0000 │   0.0000 │
│ 2021-03-17 │ 101.0000 │ 200.0000 │   0.0000 │   0.0000 │
│ 2021-03-18 │ 101.0000 │ 200.0000 │   0.0000 │   0.0000 │
│ 2021-03-19 │ 101.0000 │ 200.0000 │   0.0000 │   0.0000 │
└────────────┴──────────┴──────────┴──────────┴──────────┘
```
