---
title: "Encrypt"
linkTitle: "Encrypt"
---

## WHERE over encrypted column

```sql
CREATE TABLE encrypt
(
    `key` UInt32,
    `value` FixedString(4)
)
ENGINE = MergeTree
ORDER BY key;

INSERT INTO encrypt SELECT
    number,
    encrypt('aes-256-ctr', reinterpretAsString(number + 0.3), 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'xxxxxxxxxxxxxxxx')
FROM numbers(100000000);

SET max_threads = 1;

SELECT count()
FROM encrypt
WHERE value IN encrypt('aes-256-ctr', reinterpretAsString(toFloat32(1.3)), 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'xxxxxxxxxxxxxxxx')

┌─count()─┐
│       1 │
└─────────┘

1 rows in set. Elapsed: 0.666 sec. Processed 100.00 million rows, 400.01 MB (150.23 million rows/s., 600.93 MB/s.)


SELECT count()
FROM encrypt
WHERE reinterpretAsFloat32(encrypt('aes-256-ctr', value, 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'xxxxxxxxxxxxxxxx')) IN toFloat32(1.3)

┌─count()─┐
│       1 │
└─────────┘

1 rows in set. Elapsed: 8.395 sec. Processed 100.00 million rows, 400.01 MB (11.91 million rows/s., 47.65 MB/s.)
```

{{% alert title="Info" color="info" %}}
Because encryption and decryption can be expensive due re-initialization of keys and iv, usually it make sense to use those functions over literal values instead of table column.
{{% /info %}}
