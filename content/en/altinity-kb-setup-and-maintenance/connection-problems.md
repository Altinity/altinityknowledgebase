---
title: "Can not connect to my ClickHouse server"
linkTitle: "Can not connect to my ClickHouse server"
weight: 100
description: >-
     Can not connect to my ClickHouse server.
---

## Can not connect to my ClickHouse server

Errors like 
"Connection reset by peer, while reading from socket"

1. Ensure that the clickhouse-server is running

   ```sh
   systemctl status clickhouse-server
   ```

   If server was restarted recently and don't accept the connections after the restart - most probably it still just starting. 
   During the startup sequence it need to iterate over all data folders in /var/lib/clickhouse-server 
   In case if you have a very high number of folders there (usually caused by a wrong partitioning, or a very high number of tables / databases)
   that startup time can take a lot of time (same can happen if disk is very slow, for example NFS).
   
   You can check that by looking for 'Ready for connections' line in `/var/log/clickhouse-server/clickhouse-server.log` (`Information` log level neede)
   
2. Ensure you use the proper port ip / interface?

   Ensure you're not trying to connect to secure port without tls / https or vice versa.

   For clickhouse-client - pay attention on host / port / secure flags.

   Ensure the interface you're connecting to is the one which clickhouse listens (by default clickhouse listens only localhost).

   Note: If you uncomment line `<listen_host>0.0.0.0</listen_host>` only - clickhouse will listen only ipv4 interfaces,
   while the localhost (used by clickhouse-client) may be resolved to ipv6 address. And clickhouse-client may be failing to connect.


   How to check which interfaces / ports do clickhouse listen?

   ```sh
   sudo lsof -i -P -n | grep LISTEN

   echo listen_host
   sudo clickhouse-extract-from-config --config=/etc/clickhouse-server/config.xml --key=listen_host
   echo tcp_port
   sudo clickhouse-extract-from-config --config=/etc/clickhouse-server/config.xml --key=tcp_port
   echo tcp_port_secure
   sudo clickhouse-extract-from-config --config=/etc/clickhouse-server/config.xml --key=tcp_port_secure
   echo http_port
   sudo clickhouse-extract-from-config --config=/etc/clickhouse-server/config.xml --key=http_port
   echo https_port
   sudo clickhouse-extract-from-config --config=/etc/clickhouse-server/config.xml --key=https_port
   ```

3. For secure connection:
   - ensure that server uses some certificate which can be validated by the client
   - OR disable certificate checks on the client (UNSECURE)

4. Check for errors in /var/log/clickhouse-server/clickhouse-server.err.log ?

5. Is clickhouse able to serve some trivial tcp / http requests from localhost?

   ```sh
   curl 127.0.0.1:9200
   curl 127.0.0.1:8123
   ```

6. Check number of sockets opened by clickhouse

   ```sh
   sudo lsof -i -a -p $(pidof clickhouse-server)
   
   # or (adjust 9000 / 8123 ports if needed)
   netstat -tn 2>/dev/null | tail -n +3 | awk '{ printf("%s\t%s\t%s\t%s\t%s\t%s\n", $1, $2, $3, $4, $5, $6) }' | clickhouse-local -S "Proto String, RecvQ Int64, SendQ Int64, LocalAddress String, ForeignAddress String, State LowCardinality(String)" --query="SELECT * FROM table WHERE LocalAddress like '%:9000' FORMAT PrettyCompact"
   
   netstat -tn 2>/dev/null | tail -n +3 | awk '{ printf("%s\t%s\t%s\t%s\t%s\t%s\n", $1, $2, $3, $4, $5, $6) }' | clickhouse-local -S "Proto String, RecvQ Int64, SendQ Int64, LocalAddress String, ForeignAddress String, State LowCardinality(String)" --query="SELECT * FROM table WHERE LocalAddress like '%:8123' FORMAT PrettyCompact"
   ```

   ClickHouse has a limit of number of open connections (4000 by default).

7. Check also:

   ```sh
   # system overall support limited number of connections it can handle
   netstat
   
   # you can also be reaching of of the process ulimits (Max open files)
   cat /proc/$(pidof -s clickhouse-server)/limits
   ```

8. Check firewall / selinux rules (if used)
