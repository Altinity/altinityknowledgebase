---
title: "ALTER MODIFY COLUMN is stuck, the column is inaccessible."
linkTitle: "ALTER MODIFY COLUMN is stuck, the column is inaccessible."
description: >
    ALTER MODIFY COLUMN is stuck, the column is inaccessible.
---
## Problem

You have table:

```sql
CREATE TABLE modify_column(column_n String) ENGINE=MergeTree() ORDER BY tuple();
```

Populate it with data:

```sql
INSERT INTO modify_column VALUES ('key_a');
INSERT INTO modify_column VALUES ('key_b');
INSERT INTO modify_column VALUES ('key_c');
```

Tried to apply alter table query with changing column type:

```sql
ALTER TABLE modify_column MODIFY COLUMN column_n Enum8('key_a'=1, 'key_b'=2);
```

But it didn’t succeed and you see an error in system.mutations table:

```sql
SELECT *
FROM system.mutations
WHERE (table = 'modify_column') AND (is_done = 0)
FORMAT Vertical

Row 1:
──────
database:                   default
table:                      modify_column
mutation_id:                mutation_4.txt
command:                    MODIFY COLUMN `column_n` Enum8('key_a' = 1, 'key_b' = 2)
create_time:                2021-03-03 18:38:09
block_numbers.partition_id: ['']
block_numbers.number:       [4]
parts_to_do_names:          ['all_3_3_0']
parts_to_do:                1
is_done:                    0
latest_failed_part:         all_3_3_0
latest_fail_time:           2021-03-03 18:38:59
latest_fail_reason:         Code: 36, e.displayText() = DB::Exception: Unknown element 'key_c' for type Enum8('key_a' = 1, 'key_b' = 2): while executing 'FUNCTION CAST(column_n :: 0, 'Enum8(\'key_a\' = 1, \'key_b\' = 2)' :: 1) -> cast(column_n, 'Enum8(\'key_a\' = 1, \'key_b\' = 2)') Enum8('key_a' = 1, 'key_b' = 2) : 2': (while reading from part /var/lib/clickhouse/data/default/modify_column/all_3_3_0/): While executing MergeTree (version 21.3.1.6041)
```

And you can’t query that column anymore:

```sql
SELECT column_n
FROM modify_column

┌─column_n─┐
│ key_a    │
└──────────┘
┌─column_n─┐
│ key_b    │
└──────────┘
↓ Progress: 2.00 rows, 2.00 B (19.48 rows/s., 19.48 B/s.)
2 rows in set. Elapsed: 0.104 sec.

Received exception from server (version 21.3.1):
Code: 36. DB::Exception: Received from localhost:9000. DB::Exception: Unknown element 'key_c' for type Enum8('key_a' = 1, 'key_b' = 2): while executing 'FUNCTION CAST(column_n :: 0, 'Enum8(\'key_a\' = 1, \'key_b\' = 2)' :: 1) -> cast(column_n, 'Enum8(\'key_a\' = 1, \'key_b\' = 2)') Enum8('key_a' = 1, 'key_b' = 2) : 2': (while reading from part /var/lib/clickhouse/data/default/modify_column/all_3_3_0/): While executing MergeTreeThread.
```

### Solution

You should do the following:

Check which mutation is stuck and kill it:

```sql
SELECT * FROM system.mutations WHERE table = 'modify_column' AND is_done=0 FORMAT Vertical;
KILL MUTATION WHERE table = 'modify_column' AND mutation_id = 'id_of_stuck_mutation';
```

Apply reverting modify column query to convert table to previous column type:

```sql
ALTER TABLE modify_column MODIFY COLUMN column_n String;
```

Check if column is accessible now:

```sql
SELECT column_n, count() FROM modify_column GROUP BY column_n;
```

Run optimize table before (test in 23.8), run fixed ALTER MODIFY COLUMN query will error:

```sql
ALTER TABLE modify_column
    MODIFY COLUMN `column_n` Enum8('kye_a' = 1, 'key_b' = 2, 'key_c' = 3)

Query id: a7f9d228-41cc-407b-b03e-eac2d2c5ddbd


0 rows in set. Elapsed: 0.123 sec. 

Received exception from server (version 23.8.9):
Code: 341. DB::Exception: Received from localhost:9000. DB::Exception: Exception happened during execution of mutation 'mutation_6.txt' with part 'all_1_1_0_5' reason: 'Code: 691. DB::Exception: Unknown element 'key_a' for enum, maybe you meant: ['key_b']: while executing 'FUNCTION _CAST(column_n :: 0, 'Enum8(\'kye_a\' = 1, \'key_b\' = 2, \'key_c\' = 3)' :: 1) -> _CAST(column_n, 'Enum8(\'kye_a\' = 1, \'key_b\' = 2, \'key_c\' = 3)') Enum8('kye_a' = 1, 'key_b' = 2, 'key_c' = 3) : 2': (while reading from part /clickhouse/store/e2a/e2adbf6d-7e36-40c6-b899-c0012dceb172/all_1_1_0_5/ located on disk default of type local): While executing MergeTreeSequentialSource. (UNKNOWN_ELEMENT_OF_ENUM) (version 23.8.9.1)'. This error maybe retryable or not. In case of unretryable error, mutation can be killed with KILL MUTATION query. (UNFINISHED)
```

```sql
OPTIMIZE TABLE modify_column FINAL;
```

Run fixed ALTER MODIFY COLUMN query.

```sql
ALTER TABLE modify_column MODIFY COLUMN column_n Enum8('key_a'=1, 'key_b'=2, 'key_c'=3);
```

You can monitor progress of column type change with system.mutations or system.parts_columns tables:

```sql
SELECT
    command,
    parts_to_do,
    is_done
FROM system.mutations
WHERE table = 'modify_column'

SELECT
    column,
    type,
    count() AS parts,
    sum(rows) AS rows,
    sum(bytes_on_disk) AS bytes
FROM system.parts_columns
WHERE (table = 'modify_column') AND (column = 'column_n') AND active
GROUP BY
    column,
    type
```
