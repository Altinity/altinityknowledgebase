---
title: "Backfill/populate MV in a controlled manner"
linkTitle: "Backfill/populate MV in a controlled manner"
description: >
    Backfill/populate MV in a controlled manner
---
Q. How to populate MV create with TO syntax? INSERT INTO mv SELECT \* FROM huge_table? Will it work if the source table has billions of rows?

A. single huge `insert ... select ...` actually will work, but it will take A LOT of time, and during that time lot of bad things can happen (lack of disk space, hard restart etc). Because of that, it's better to do such backfill in a more controlled manner and in smaller pieces.

One of the best options is to fill one partition at a time, and if it breaks you can drop the partition and refill it.

If you need to construct a single partition from several sources - then the following approach may be the best.

```sql
CREATE TABLE mv_import AS mv;
INSERT INTO mv_import SELECT * FROM huge_table WHERE toYYYYMM(ts) = 202105;
/* or other partition expression*/

/* that insert select may take a lot of time, if something bad will happen
  during that - just truncate mv_import and restart the process */

/* after successful loading of mv_import do*/
ALTER TABLE mv ATTACH PARTITION ID '202105' FROM  mv_import;
```

See also [https://clickhouse.tech/docs/en/sql-reference/statements/alter/partition/\#alter_attach-partition-from](https://clickhouse.tech/docs/en/sql-reference/statements/alter/partition/\#alter_attach-partition-from).
