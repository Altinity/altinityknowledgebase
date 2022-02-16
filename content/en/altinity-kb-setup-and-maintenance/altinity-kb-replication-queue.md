---
title: "Replication queue"
linkTitle: "Replication queue"
description: >
    Replication queue
---
```sql
SELECT
    database,
    table,
    type,
    max(last_exception),
    max(postpone_reason),
    min(create_time),
    max(last_attempt_time),
    max(last_postpone_time),
    max(num_postponed) AS max_postponed,
    max(num_tries) AS max_tries,
    min(num_tries) AS min_tries,
    countIf(last_exception != '') AS count_err,
    countIf(num_postponed > 0) AS count_postponed,
    countIf(is_currently_executing) AS count_executing,
    count() AS count_all
FROM system.replication_queue
GROUP BY
    database,
    table,
    type
ORDER BY count_all DESC
```
