---
title: "ALTER MODIFY COLUMN is stuck, the column is inaccessible."
linkTitle: "ALTER MODIFY COLUMN is stuck, the column is inaccessible."
description: >
    ALTER MODIFY COLUMN is stuck, the column is inaccessible.
---
## Problem

You’ve created a table in ClickHouse with the following structure:

```sql
CREATE TABLE modify_column(column_n String) ENGINE=MergeTree() ORDER BY tuple();
```

You populated the table with some data:

```sql
INSERT INTO modify_column VALUES ('key_a');
INSERT INTO modify_column VALUES ('key_b');
INSERT INTO modify_column VALUES ('key_c');
```

Next, you attempted to change the column type using this query:

```sql
ALTER TABLE modify_column MODIFY COLUMN column_n Enum8('key_a'=1, 'key_b'=2);
```

However, the operation failed, and you encountered an error when inspecting the system.mutations table:

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

The mutation result showed an error indicating that the value 'key_c' was not recognized in the Enum8 definition:
```sql
Unknown element 'key_c' for type Enum8('key_a' = 1, 'key_b' = 2)
```

Now, when trying to query the column, ClickHouse returns an exception and the column becomes inaccessible:

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

This query results in:
```sql
Code: 36. DB::Exception: Unknown element 'key_c' for type Enum8('key_a' = 1, 'key_b' = 2)
```

### Root Cause
The failure occurred because the Enum8 type only allows for predefined values. Since 'key_c' wasn't included in the definition, the mutation failed and left the table in an inconsistent state.

### Solution

1. Identify and Terminate the Stuck Mutation
First, you need to locate the mutation that’s stuck in an incomplete state.

```sql
SELECT * FROM system.mutations WHERE table = 'modify_column' AND is_done=0 FORMAT Vertical;
```

Once you’ve identified the mutation, terminate it using:
```sql
KILL MUTATION WHERE table = 'modify_column' AND mutation_id = 'id_of_stuck_mutation';
```
This will stop the operation and allow you to revert the changes.

2. Revert the Column Type
Next, revert the column back to its original type, which was String, to restore the table’s accessibility:

```sql
ALTER TABLE modify_column MODIFY COLUMN column_n String;
```

3. Verify the Column is Accessible Again
To ensure the column is functioning normally, run a simple query to verify its data:

```sql
SELECT column_n, count() FROM modify_column GROUP BY column_n;
```

4. Apply the Correct Column Modification
Now that the column is accessible, you can safely reapply the ALTER query, but this time include all the required enum values:

```sql
ALTER TABLE modify_column MODIFY COLUMN column_n Enum8('key_a'=1, 'key_b'=2, 'key_c'=3);
```

5. Monitor Progress
You can monitor the progress of the column modification using the system.mutations or system.parts_columns tables to ensure everything proceeds as expected:

To track mutation progress:

```sql
SELECT
    command,
    parts_to_do,
    is_done
FROM system.mutations
WHERE table = 'modify_column';
```

To review the column's active parts:

```sql
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
    type;
```
