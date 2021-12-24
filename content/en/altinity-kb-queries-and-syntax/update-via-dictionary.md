---
title: "UPDATE via Dictionary"
linkTitle: "UPDATE via Dictionary"
description: >
    UPDATE via Dictionary
---
```sql
CREATE TABLE test_update
(
    `key` UInt32,
    `value` String
)
ENGINE = MergeTree
ORDER BY key;

INSERT INTO test_update SELECT
    number,
    concat('value ', toString(number))
FROM numbers(20);

SELECT *
FROM test_update;

┌─key─┬─value────┐
│   0 │ value 0  │
│   1 │ value 1  │
│   2 │ value 2  │
│   3 │ value 3  │
│   4 │ value 4  │
│   5 │ value 5  │
│   6 │ value 6  │
│   7 │ value 7  │
│   8 │ value 8  │
│   9 │ value 9  │
│  10 │ value 10 │
│  11 │ value 11 │
│  12 │ value 12 │
│  13 │ value 13 │
│  14 │ value 14 │
│  15 │ value 15 │
│  16 │ value 16 │
│  17 │ value 17 │
│  18 │ value 18 │
│  19 │ value 19 │
└─────┴──────────┘

CREATE TABLE test_update_source
(
    `key` UInt32,
    `value` String
)
ENGINE = MergeTree
ORDER BY key;

INSERT INTO test_update_source VALUES (1,'other value'), (10, 'new value');

CREATE DICTIONARY update_dict
(
    `key` UInt32,
    `value` String
)
PRIMARY KEY key
SOURCE(CLICKHOUSE(TABLE 'test_update_source'))
LIFETIME(MIN 0 MAX 10)
LAYOUT(FLAT);

SELECT dictGet('default.update_dict', 'value', toUInt64(1));

┌─dictGet('default.update_dict', 'value', toUInt64(1))─┐
│ other value                                          │
└──────────────────────────────────────────────────────┘

ALTER TABLE test_update
    UPDATE value = dictGet('default.update_dict', 'value', toUInt64(key)) WHERE dictHas('default.update_dict', toUInt64(key));

SELECT *
FROM test_update

┌─key─┬─value───────┐
│   0 │ value 0     │
│   1 │ other value │
│   2 │ value 2     │
│   3 │ value 3     │
│   4 │ value 4     │
│   5 │ value 5     │
│   6 │ value 6     │
│   7 │ value 7     │
│   8 │ value 8     │
│   9 │ value 9     │
│  10 │ new value   │
│  11 │ value 11    │
│  12 │ value 12    │
│  13 │ value 13    │
│  14 │ value 14    │
│  15 │ value 15    │
│  16 │ value 16    │
│  17 │ value 17    │
│  18 │ value 18    │
│  19 │ value 19    │
└─────┴─────────────┘
```

{{% alert title="Info" color="info" %}}
In case of Replicated installation, Dictionary should be created on all nodes and source tables should have ReplicatedMergeTree engine and be replicated across all nodes.
{{% /alert %}}

{{% alert title="Info" color="info" %}}
[Starting](https://github.com/ClickHouse/ClickHouse/pull/10186) from 20.4, ClickHouse forbid by default any potential non-deterministic mutations.
This behavior controlled by setting `allow_nondeterministic_mutations`. You can apped it to query like this `ALTER TABLE xxx UPDATE ... WHERE ... SETTINGS allow_nondeterministic_mutations = 1;`
For `ON CLUSTER` queries, you would need to put this setting in default profile and restart ClickHouse servers.
{{% /alert %}}
