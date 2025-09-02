---
title: "Client Timeouts"
linkTitle: "Client Timeouts"
weight: 100
description: >-
     How to prevent connection errors.
---

Timeout settings are related to the client, server, and network. They can be tuned to solve sporadic timeout issues.

It's important to understand that network devices (routers, NATs, load balancers ) could have their own timeouts. Sometimes, they won't respect TCP keep-alive and close the session due to inactivity.   Only application-level keepalives could prevent TCP sessions from closing. 

Below are the settings that will work only if you set them in the default user profile. The problem is that they should be applied before the connection happens. And if you send them with a query/connection, it's already too late.

```sql

        "receive_timeout": 3600,
        "send_timeout": 3600,
        "http_receive_timeout": 3600,
        "http_send_timeout": 3600,
        "http_connection_timeout": 2,
```

Those can be set on the query level (but in the profile, too)

```sql
SETTINGS
    tcp_keep_alive_timeout = 3600,
    --!!!send_progress_in_http_headers = 1,
    http_headers_progress_interval_ms = 10000,
    http_wait_end_of_query = 1,
    max_execution_time = 3600
```

https://clickhouse.com/docs/en/integrations/language-clients/javascript#keep-alive-nodejs-only

`send_progress_in_http_headers`  will not be applied in this way because here we can configure the JDBC driver’s client options only ([this](https://github.com/ClickHouse/clickhouse-java/blob/main/clickhouse-client/src/main/java/com/clickhouse/client/config/ClickHouseClientOption.java)), but there is an option called `custom_settings`  ([this](https://github.com/ClickHouse/clickhouse-java/blob/main/clickhouse-client/src/main/java/com/clickhouse/client/config/ClickHouseClientOption.java#L34C22-L34C37)) that will apply custom ch query settings for every query before the actual connection is created. The correct JDBC connection string will look like this:

```
jdbc:clickhouse://"${clickhouse.host}"/"${clickhouse.db}"?ssl=true&socket_timeout=3600000&socket_keepalive=true&custom_settings=send_progress_in_http_headers=1
```

### Description

- `http_send_timeout & send_timeout`: The timeout for sending data to the socket. If the server takes longer than this value to send data, the connection will be terminated (i.e., when the server pushes data to the client, and the client is not reading that for some reason).
- `http_receive_timeout & receive_timeout:` The timeout for receiving data from the socket. If the server takes longer than this value to receive the entire request from the client, the connection will be terminated. This setting ensures that the server is not kept waiting indefinitely for slow or unresponsive clients (i.e., the server tries to get some data from the client, but the client does not send anything).
- `http_connection_timeout & connect_timeout`: Defines how long ClickHouse should wait when it connects to another server. If the connection cannot be established within this time frame, it will be terminated. This does not impact the clients which connect to ClickHouse using HTTP (it only matters when ClickHouse works as a TCP/HTTP client).
- `keep_alive_timeout`: This is for 'Connection: keep-alive' in HTTP 1.1, only for HTTP. It defines how long ClickHouse can wait for the next request in the same connection to arrive after serving the previous one. It does not lead to any SOCKET_TIMEOUT exception, just closes the socket if the client doesn't start a new request after that time.

<aside>
💡 In 23.12 `keep_alive_timeout` was introduced default of 10 seconds. Before 23.12 default `keep_alive_timeout` configured on clickhouse side was 3. For 23.8 `keep_alive_timeout` is not  present as a server setting in `system.server_settings` table but if is in the config.xml.

</aside>

- `sync_request_timeout` – timeout for server ping. Defaults to 5 seconds.

In some cases, if the data sync request time out, it may be caused by many different reasons, basically it shouldn't take more than 5 seconds for synchronous request-result protocol call (like Ping or TableStatus) in most of the normal circumstances, thus if time out setting too long, eg. 5 minutes or longer than that, then you will run into more overall performance issues. This is not good for any application on the server.


### How to check the current timeouts:

```sql
SELECT
    name,
    value,
    changed,
    description
FROM system.settings
WHERE (name ILIKE '%send_timeout%') OR (name ILIKE '%receive_timeout%') OR (name ILIKE '%keep_alive%') OR (name ILIKE '%_http_headers') OR (name ILIKE 'http_headers_progres_%') OR (name ILIKE 'http_connection_%')
```

