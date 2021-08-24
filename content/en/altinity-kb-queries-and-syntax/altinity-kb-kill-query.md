---
title: "KILL QUERY"
linkTitle: "KILL QUERY"
description: >
    KILL QUERY
---
Unfortunately not all queries can be killed.
`KILL QUERY` only sets a flag that must be checked by the query.
A query pipeline is checking this flag before a switching to next block. If the pipeline has stuck somewhere in the middle it cannot be killed.
If a query does not stop, the only way to get rid of it is to restart ClickHouse.

See also

[https://github.com/ClickHouse/ClickHouse/issues/3964](https://github.com/ClickHouse/ClickHouse/issues/3964)
[https://github.com/ClickHouse/ClickHouse/issues/1576](https://github.com/ClickHouse/ClickHouse/issues/1576)

## How to replace a running query

> Q. We are trying to abort running queries when they are being replaced with a new one. We are setting the same query id for this. In some cases this error happens:
>
> Query with id = e213cc8c-3077-4a6c-bc78-e8463adad35d is already running and can't be stopped
>
> The query is still being killed but the new one is not being executed. Do you know anything about this and if there is a fix or workaround for it?

I guess you use replace_running_query + replace_running_query_max_wait_ms.

Unfortunately it's not always possible to kill the query at random moment of time.

Kill don't send any signals, it just set a flag. Which gets (synchronously) checked at certain moments of query execution, mostly after finishing processing one block and starting another.

On certain stages (executing scalar sub-query) the query can not be killed at all. This is a known issue and requires an architectural change to fix it.

> I see. Is there a workaround?
>
> This is our use case:
>
> A user requests an analytics report which has a query that takes several settings, the user makes changes to the report (e.g. to filters, metrics, dimensions...). Since the user changed what he is looking for the query results from the initial query are never used and we would like to cancel it when starting the new query (edited)

You can just use 2 commands:

```sql
KILL QUERY WHERE query_id = ' ... ' ASYNC

SELECT ... new query ....
```

in that case you don't need to care when the original query will be stopped.
