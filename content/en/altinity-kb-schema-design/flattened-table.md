---
title: "Flattened table"
linkTitle: "Flattened table"
description: >
    Flattened table
---
It's possible to use dictionaries for populating columns of fact table.

```sql
CREATE TABLE customer
(
    `customer_id` UInt32,
    `first_name` String,
    `birth_date` Date,
    `sex` Enum('M' = 1, 'F' = 2)
)
ENGINE = MergeTree
ORDER BY customer_id

CREATE TABLE order
(
    `order_id` UInt32,
    `order_date` DateTime DEFAULT now(),
    `cust_id` UInt32,
    `amount` Decimal(12, 2)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(order_date)
ORDER BY (order_date, cust_id, order_id)

INSERT INTO customer VALUES(1, 'Mike', now() - INTERVAL 30 YEAR, 'M');
INSERT INTO customer VALUES(2, 'Boris', now() - INTERVAL 40 YEAR, 'M');
INSERT INTO customer VALUES(3, 'Sofie', now() - INTERVAL 24 YEAR, 'F');

INSERT INTO order (order_id, cust_id, amount) VALUES(50, 1, 15);
INSERT INTO order (order_id, cust_id, amount) VALUES(30, 1, 10);

SELECT * EXCEPT 'order_date'
FROM order

┌─order_id─┬─cust_id─┬─amount─┐
│       30 │       1 │  10.00 │
│       50 │       1 │  15.00 │
└──────────┴─────────┴────────┘

CREATE DICTIONARY customer_dict
(
    `customer_id` UInt32,
    `first_name` String,
    `birth_date` Date,
    `sex` UInt8
)
PRIMARY KEY customer_id
SOURCE(CLICKHOUSE(TABLE 'customer'))
LIFETIME(MIN 0 MAX 300)
LAYOUT(FLAT)

ALTER TABLE order
  ADD COLUMN `cust_first_name` String DEFAULT dictGetString('default.customer_dict', 'first_name', toUInt64(cust_id)),
  ADD COLUMN `cust_sex` Enum('M' = 1, 'F' = 2) DEFAULT dictGetUInt8('default.customer_dict', 'sex', toUInt64(cust_id)),
    ADD COLUMN `cust_birth_date` Date DEFAULT dictGetDate('default.customer_dict', 'birth_date', toUInt64(cust_id));

INSERT INTO order (order_id, cust_id, amount) VALUES(10, 3, 30);
INSERT INTO order (order_id, cust_id, amount) VALUES(20, 3, 60);
INSERT INTO order (order_id, cust_id, amount) VALUES(40, 2, 20);

SELECT * EXCEPT 'order_date'
FROM order
FORMAT PrettyCompactMonoBlock

┌─order_id─┬─cust_id─┬─amount─┬─cust_first_name─┬─cust_sex─┬─cust_birth_date─┐
│       30 │       1 │  10.00 │ Mike            │ M        │      1991-08-05 │
│       50 │       1 │  15.00 │ Mike            │ M        │      1991-08-05 │
│       10 │       3 │  30.00 │ Sofie           │ F        │      1997-08-05 │
│       40 │       2 │  20.00 │ Boris           │ M        │      1981-08-05 │
│       20 │       3 │  60.00 │ Sofie           │ F        │      1997-08-05 │
└──────────┴─────────┴────────┴─────────────────┴──────────┴─────────────────┘

ALTER TABLE customer UPDATE birth_date = now() - INTERVAL 35 YEAR WHERE customer_id=2;

SYSTEM RELOAD DICTIONARY customer_dict;

ALTER TABLE order
    UPDATE cust_birth_date = dictGetDate('default.customer_dict', 'birth_date', toUInt64(cust_id)) WHERE 1
-- or if you do have track of changes it's possible to lower amount of dict calls
--  UPDATE cust_birth_date = dictGetDate('default.customer_dict', 'birth_date', toUInt64(cust_id)) WHERE customer_id = 2


SELECT * EXCEPT 'order_date'
FROM order
FORMAT PrettyCompactMonoBlock

┌─order_id─┬─cust_id─┬─amount─┬─cust_first_name─┬─cust_sex─┬─cust_birth_date─┐
│       30 │       1 │  10.00 │ Mike            │ M        │      1991-08-05 │
│       50 │       1 │  15.00 │ Mike            │ M        │      1991-08-05 │
│       10 │       3 │  30.00 │ Sofie           │ F        │      1997-08-05 │
│       40 │       2 │  20.00 │ Boris           │ M        │      1986-08-05 │
│       20 │       3 │  60.00 │ Sofie           │ F        │      1997-08-05 │
└──────────┴─────────┴────────┴─────────────────┴──────────┴─────────────────┘
```

`ALTER TABLE order UPDATE` would completely overwrite this column in table, so it's not recommended to run it often.
