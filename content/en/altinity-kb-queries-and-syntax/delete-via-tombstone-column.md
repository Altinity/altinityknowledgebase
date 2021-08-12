---
title: "DELETE via tombstone column"
linkTitle: "DELETE via tombstone column"
description: >
    DELETE via tombstone column
---
```sql
CREATE TABLE test_delete
(
    `key` UInt32,
    `ts` UInt32,
    `value_a` String,
    `value_b` String,
    `value_c` String,
    `is_active` UInt8 DEFAULT 1
)
ENGINE = MergeTree
ORDER BY key;

INSERT INTO test_delete (key, ts, value_a, value_b, value_c) SELECT
    number,
    1,
    concat('some_looong_string', toString(number)),
    concat('another_long_str', toString(number)),
    concat('string', toString(number))
FROM numbers(10000000);

INSERT INTO test_delete (key, ts, value_a, value_b, value_c) VALUES (400000, 2, 'totally different string', 'another totally different string', 'last string');

SELECT *
FROM test_delete
WHERE key = 400000;

┌────key─┬─ts─┬─value_a──────────────────┬─value_b──────────────────────────┬─value_c─────┬─is_active─┐
│ 400000 │  2 │ totally different string │ another totally different string │ last string │         1 │
└────────┴────┴──────────────────────────┴──────────────────────────────────┴─────────────┴───────────┘
┌────key─┬─ts─┬─value_a──────────────────┬─value_b────────────────┬─value_c──────┬─is_active─┐
│ 400000 │  1 │ some_looong_string400000 │ another_long_str400000 │ string400000 │         1 │
└────────┴────┴──────────────────────────┴────────────────────────┴──────────────┴───────────┘

SET mutations_sync = 2;

ALTER TABLE test_delete
    UPDATE is_active = 0 WHERE (key = 400000) AND (ts = 1);

Ok.

0 rows in set. Elapsed: 0.058 sec.

SELECT *
FROM test_delete
WHERE (key = 400000) AND is_active;

┌────key─┬─ts─┬─value_a──────────────────┬─value_b──────────────────────────┬─value_c─────┬─is_active─┐
│ 400000 │  2 │ totally different string │ another totally different string │ last string │         1 │
└────────┴────┴──────────────────────────┴──────────────────────────────────┴─────────────┴───────────┘

ALTER TABLE test_delete
    DELETE WHERE (key = 400000) AND (ts = 1);

Ok.

0 rows in set. Elapsed: 1.101 sec. -- 20 times slower!!!

SELECT *
FROM test_delete
WHERE key = 400000;

┌────key─┬─ts─┬─value_a──────────────────┬─value_b──────────────────────────┬─value_c─────┬─is_active─┐
│ 400000 │  2 │ totally different string │ another totally different string │ last string │         1 │
└────────┴────┴──────────────────────────┴──────────────────────────────────┴─────────────┴───────────┘

-- For ReplacingMergeTree

OPTIMIZE TABLE test_delete FINAL;

Ok.

0 rows in set. Elapsed: 2.230 sec. -- 40 times slower!!!

SELECT *
FROM test_delete
WHERE key = 400000

┌────key─┬─ts─┬─value_a──────────────────┬─value_b──────────────────────────┬─value_c─────┬─is_active─┐
│ 400000 │  2 │ totally different string │ another totally different string │ last string │         1 │
└────────┴────┴──────────────────────────┴──────────────────────────────────┴─────────────┴───────────┘
```
