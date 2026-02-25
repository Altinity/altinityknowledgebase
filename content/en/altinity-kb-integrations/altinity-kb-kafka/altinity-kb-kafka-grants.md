# Grants and the Kafka Engine   

There are some issues that are useful to know about when working with the Kafka engine with respect to Grants

## Default user, out of the box

The default user, as set up on a stock installation, has no issues with respect to access to both Kafka Engine tables or `system.kakfa_consumers`.

## Creating users with access to Kafka engine tables and `system.kafka_consumers`

There is sometimes a need to create a database user for the purpose of accessing various system tables, albeit one without admin privileges and one that is read-only.

In this situation, the grants given aren't what one would expect in that grants would be given on a table-granular level, but at a database-wide level.

The request: there needs to be a "dba" user with read-only privileges that has the ability to read `system.kafka_consumers`.

Granting `SELECT` to the user specifying `system.kafka_consumers` and any Kafka engine tables, per table, will allow access to those tables and `system.kafka_cosumers` without any errors, but the resultset of selecting the rows in `system.kafka_consumers` will be empty.

The only way for this to work is the following:

```
CREATE ROLE 'dbsupport';
GRANT SELECT on *.* to dbsupport_admin;
CREATE USER dba INDENTIFIED WITH sha256_password BY 'secure-password'
GRANT dbsupport TO dba
```

This user should then be able to query `system.kafka_consumers`:

example:

```

clickhouse-client -u dba

clickhouse01 :) select * from system.kafka_consumers FORMAT Vertical;

SELECT *
FROM system.kafka_consumers
FORMAT Vertical

Query id: 218de3e6-d12f-43f0-95ed-122cd39be7c1

Row 1:
──────
database:                   default
table:                      readings_queue
consumer_id:                ClickHouse-clickhouse01-default-readings_queue-68867c5b-92b6-4fa8-994d-ea4834fedc1c
assignments.topic:          ['readings','readings','readings','readings','readings','readings']
assignments.partition_id:   [0,1,2,3,4,5]
assignments.current_offset: [-1001,-1001,-1001,-1001,-1001,-1001]
exceptions.time:            []
exceptions.text:            []
last_poll_time:             2025-03-06 20:33:21
num_messages_read:          6
last_commit_time:           2025-03-05 21:20:36
num_commits:                1
last_rebalance_time:        2025-03-06 11:49:46
num_rebalance_revocations:  3
num_rebalance_assignments:  4
is_currently_used:          1
last_used:                  2025-03-06 20:33:21.187460
rdkafka_stat:               

1 row in set. Elapsed: 0.004 sec. 
```