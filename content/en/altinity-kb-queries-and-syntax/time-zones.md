---
title: "Time zones"
linkTitle: "Time zones"
description: >
    Time zones
---
Important things to know:

1. DateTime inside clickhouse is actually UNIX timestamp always, i.e. number of seconds since 1970-01-01 00:00:00 GMT.
2. Conversion from that UNIX timestamp to a human-readable form and reverse can happen on the client (for native clients) and on the server (for HTTP clients, and for some type of queries, like `toString(ts)`)
3. Depending on the place where that conversion happened rules of different timezones may be applied.
4. You can check server timezone using `SELECT timezone()`
5. clickhouse-client also by default tries to use server timezone (see also `--use_client_time_zone` flag)
6. If you want you can store the timezone name inside the data type, in that case, timestamp <-> human-readable time rules of that timezone will be applied.

```sql
SELECT
    timezone(),
    toDateTime(now()) AS t,
    toTypeName(t),
    toDateTime(now(), 'UTC') AS t_utc,
    toTypeName(t_utc),
    toUnixTimestamp(t),
    toUnixTimestamp(t_utc)

Row 1:
──────
timezone():                                Europe/Warsaw
t:                                         2021-07-16 12:50:28
toTypeName(toDateTime(now())):             DateTime
t_utc:                                     2021-07-16 10:50:28
toTypeName(toDateTime(now(), 'UTC')):      DateTime('UTC')
toUnixTimestamp(toDateTime(now())):        1626432628
toUnixTimestamp(toDateTime(now(), 'UTC')): 1626432628
```

Since version 20.4 clickhouse uses embedded tzdata (see [https://github.com/ClickHouse/ClickHouse/pull/10425](https://github.com/ClickHouse/ClickHouse/pull/10425) )

You get used tzdata version

```sql
SELECT *
FROM system.build_options
WHERE name = 'TZDATA_VERSION'

Query id: 0a9883f0-dadf-4fb1-8b42-8fe93f561430

┌─name───────────┬─value─┐
│ TZDATA_VERSION │ 2020e │
└────────────────┴───────┘
```

and list of available time zones

```sql
SELECT *
FROM system.time_zones
WHERE time_zone LIKE '%Anta%'

Query id: 855453d7-eccd-44cb-9631-f63bb02a273c

┌─time_zone─────────────────┐
│ Antarctica/Casey          │
│ Antarctica/Davis          │
│ Antarctica/DumontDUrville │
│ Antarctica/Macquarie      │
│ Antarctica/Mawson         │
│ Antarctica/McMurdo        │
│ Antarctica/Palmer         │
│ Antarctica/Rothera        │
│ Antarctica/South_Pole     │
│ Antarctica/Syowa          │
│ Antarctica/Troll          │
│ Antarctica/Vostok         │
│ Indian/Antananarivo       │
└───────────────────────────┘

13 rows in set. Elapsed: 0.002 sec.

```

### When the conversion using different rules happen

```sql
SELECT timezone()

┌─timezone()─┐
│ UTC        │
└────────────┘

create table t_with_dt_utc ( ts DateTime64(3,'Europe/Moscow') ) engine=Log;

create table x (ts String) engine=Null;

create materialized view x_mv to t_with_dt_utc as select parseDateTime64BestEffort(ts) as ts from x;

$ echo '2021-07-15T05:04:23.733' | clickhouse-client -q 'insert into t_with_dt_utc format CSV'
-- here client checks the type of the columns, see that it's 'Europe/Moscow' and use conversion according to moscow rules

$ echo '2021-07-15T05:04:23.733' | clickhouse-client -q 'insert into x format CSV'
-- here client check tha type of the columns (it is string), and pass string value to the server.
-- parseDateTime64BestEffort(ts) uses server default timezone (UTC in my case), and convert the value using UTC rules.
-- and the result is 2 different timestamps (when i selecting from that is shows both in 'desired' timezone, forced by column type, i.e. Moscow):

SELECT * FROM t_with_dt_utc
┌──────────────────────ts─┐
│ 2021-07-15 05:04:23.733 │
│ 2021-07-15 08:04:23.733 │
└─────────────────────────┘
```

Best practice here: use UTC timezone everywhere, OR use the same default timezone for clickhouse server as used by your data
