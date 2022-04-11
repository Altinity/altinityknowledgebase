---
title: "EXPLAIN query"
linkTitle: "EXPLAIN query"
description: >
    EXPLAIN query
---

### EXPLAIN types

```sql
EXPLAIN AST
        SYNTAX
        PLAN header = 0,
             description = 1,
             actions = 0,
             optimize = 1
        PIPELINE header = 0,
                 graph = 0,
                 compact = 1
        ESTIMATE
SELECT ...
```

* `AST` - abstract syntax tree
* `SYNTAX` - query text after AST-level optimizations
* `PLAN` - query execution plan
* `PIPELINE` - query execution pipeline
* `ESTIMATE` - https://github.com/ClickHouse/ClickHouse/pull/26131 (since 21.9)


References
* https://clickhouse.com/docs/en/sql-reference/statements/explain/
* Nikolai Kochetov from Yandeх. EXPLAIN query in ClickHouse. [slides](https://github.com/ClickHouse/clickhouse-presentations/blob/master/meetup47/explain.pdf), [video](https://youtu.be/ckChUkC3Pns?t=1387)
* [https://github.com/ClickHouse/clickhouse-presentations/blob/master/meetup39/query-profiling.pdf](https://github.com/ClickHouse/clickhouse-presentations/blob/master/meetup39/query-profiling.pdf)
* https://github.com/ClickHouse/ClickHouse/issues/28847
