---
title: "clickhouse-keeper-service"
linkTitle: "clickhouse-keeper-service"
weight: 100
description: >-
     clickhouse-keeper-service
---

## clickhouse-keeper-service

### installation

Need to install `clickhouse-common-static` + `clickhouse-keeper` OR `clickhouse-common-static` + `clickhouse-server`. 
Both OK, use the first if you don't need clickhouse server locally.

```bash
dpkg -i clickhouse-common-static_{%version}.deb clickhouse-keeper_{%version}.deb
```

```bash
dpkg -i clickhouse-common-static_{%version}.deb clickhouse-server_{%version}.deb clickhouse-client_{%version}.deb
```

Create directories

```bash
mkdir -p /etc/clickhouse-keeper/config.d
mkdir -p /var/log/clickhouse-keeper
mkdir -p /var/lib/clickhouse-keeper/coordination/log
mkdir -p /var/lib/clickhouse-keeper/coordination/snapshots
mkdir -p /var/lib/clickhouse-keeper/cores

chown -R clickhouse.clickhouse /etc/clickhouse-keeper /var/log/clickhouse-keeper /var/lib/clickhouse-keeper
```

### config

```
cat /etc/clickhouse-keeper/config.xml

<?xml version="1.0"?>
<clickhouse>
    <logger>
        <!-- Possible levels [1]:

          - none (turns off logging)
          - fatal
          - critical
          - error
          - warning
          - notice
          - information
          - debug
          - trace
          - test (not for production usage)

            [1]: https://github.com/pocoproject/poco/blob/poco-1.9.4-release/Foundation/include/Poco/Logger.h#L105-L114
        -->
        <level>trace</level>
        <log>/var/log/clickhouse-keeper/clickhouse-keeper.log</log>
        <errorlog>/var/log/clickhouse-keeper/clickhouse-keeper.err.log</errorlog>
        <!-- Rotation policy
             See https://github.com/pocoproject/poco/blob/poco-1.9.4-release/Foundation/include/Poco/FileChannel.h#L54-L85
          -->
        <size>1000M</size>
        <count>10</count>
        <!-- <console>1</console> --> <!-- Default behavior is autodetection (log to console if not daemon mode and is tty) -->

        <!-- Per level overrides (legacy):

        For example to suppress logging of the ConfigReloader you can use:
        NOTE: levels.logger is reserved, see below.
        -->
        <!--
        <levels>
          <ConfigReloader>none</ConfigReloader>
        </levels>
        -->

        <!-- Per level overrides:

        For example to suppress logging of the RBAC for default user you can use:
        (But please note that the logger name maybe changed from version to version, even after minor upgrade)
        -->
        <!--
        <levels>
          <logger>
            <name>ContextAccess (default)</name>
            <level>none</level>
          </logger>
          <logger>
            <name>DatabaseOrdinary (test)</name>
            <level>none</level>
          </logger>
        </levels>
        -->
        <!-- Structured log formatting:
        You can specify log format(for now, JSON only). In that case, the console log will be printed
        in specified format like JSON.
        For example, as below:
        {"date_time":"1650918987.180175","thread_name":"#1","thread_id":"254545","level":"Trace","query_id":"","logger_name":"BaseDaemon","message":"Received signal 2","source_file":"../base/daemon/BaseDaemon.cpp; virtual void SignalListener::run()","source_line":"192"}
        To enable JSON logging support, just uncomment <formatting> tag below.
        -->
        <!-- <formatting>json</formatting> -->
    </logger>

    <!-- Listen specified address.
     Use :: (wildcard IPv6 address), if you want to accept connections both with IPv4 and IPv6 from everywhere.
     Notes:
     If you open connections from wildcard address, make sure that at least one of the following measures applied:
     - server is protected by firewall and not accessible from untrusted networks;
     - all users are restricted to subset of network addresses (see users.xml);
     - all users have strong passwords, only secure (TLS) interfaces are accessible, or connections are only made via TLS interfaces.
     - users without password have readonly access.
     See also: https://www.shodan.io/search?query=clickhouse
    -->
    <!-- <listen_host>::</listen_host> -->


    <!-- Same for hosts without support for IPv6: -->
    <!-- <listen_host>0.0.0.0</listen_host> -->

    <!-- Default values - try listen localhost on IPv4 and IPv6. -->
    <!--
    <listen_host>::1</listen_host>
    <listen_host>127.0.0.1</listen_host>
    -->

    <!-- <interserver_listen_host>::</interserver_listen_host> -->
    <!-- Listen host for communication between replicas. Used for data exchange -->
    <!-- Default values - equal to listen_host -->

    <!-- Don't exit if IPv6 or IPv4 networks are unavailable while trying to listen. -->
    <!-- <listen_try>0</listen_try> -->

    <!-- Allow multiple servers to listen on the same address:port. This is not recommended.
    -->
    <!-- <listen_reuse_port>0</listen_reuse_port> -->
    <!-- <listen_backlog>4096</listen_backlog> -->

    <path>/var/lib/clickhouse-keeper/</path>
    <core_path>/var/lib/clickhouse-keeper/cores</core_path>

    <keeper_server>
	    <tcp_port>2181</tcp_port>
	    <server_id>1</server_id>
	    <log_storage_path>/var/lib/clickhouse-keeper/coordination/log</log_storage_path>
	    <snapshot_storage_path>/var/lib/clickhouse-keeper/coordination/snapshots</snapshot_storage_path>

	    <coordination_settings>
        	<operation_timeout_ms>10000</operation_timeout_ms>
	        <session_timeout_ms>30000</session_timeout_ms>
	        <raft_logs_level>trace</raft_logs_level>
	        <rotate_log_storage_interval>10000</rotate_log_storage_interval>
	    </coordination_settings>

            <raft_configuration>
	              <server>
                   <id>1</id>
                   <hostname>localhost</hostname>
                   <port>9444</port>
                </server>
           </raft_configuration>
    </keeper_server>
</clickhouse>
```

```
cat /etc/clickhouse-keeper/config.d/keeper.xml
<?xml version="1.0"?>
<clickhouse>
    <listen_host>::</listen_host>
    <keeper_server>
            <tcp_port>2181</tcp_port>
            <server_id>1</server_id>
            <raft_configuration>
                <server>
                   <id>1</id>
       	           <hostname>keeper-host-1</hostname>
                   <port>9444</port>
                </server>
                <server>
                   <id>2</id>
                   <hostname>keeper-host-2</hostname>
                   <port>9444</port>
                </server>
                <server>
                   <id>3</id>
                   <hostname>keeper-host-3</hostname>
                   <port>9444</port>
                </server>                
           </raft_configuration>
    </keeper_server>
</clickhouse>
```

### systemd service

```
cat /lib/systemd/system/clickhouse-keeper.service
[Unit]
Description=ClickHouse Keeper (analytic DBMS for big data)
Requires=network-online.target
# NOTE: that After/Wants=time-sync.target is not enough, you need to ensure
# that the time was adjusted already, if you use systemd-timesyncd you are
# safe, but if you use ntp or some other daemon, you should configure it
# additionaly.
After=time-sync.target network-online.target
Wants=time-sync.target

[Service]
Type=simple
User=clickhouse
Group=clickhouse
Restart=always
RestartSec=30
RuntimeDirectory=clickhouse-keeper
ExecStart=/usr/bin/clickhouse-keeper --config=/etc/clickhouse-keeper/config.xml --pid-file=/run/clickhouse-keeper/clickhouse-keeper.pid
# Minus means that this file is optional.
EnvironmentFile=-/etc/default/clickhouse
LimitCORE=infinity
LimitNOFILE=500000
CapabilityBoundingSet=CAP_NET_ADMIN CAP_IPC_LOCK CAP_SYS_NICE CAP_NET_BIND_SERVICE

[Install]
# ClickHouse should not start from the rescue shell (rescue.target).
WantedBy=multi-user.target
```

```
systemctl daemon-reload

systemctl status clickhouse-keeper

systemctl start clickhouse-keeper
```

### debug start without service (as foreground application)

```
sudo -u clickhouse /usr/bin/clickhouse-keeper --config=/etc/clickhouse-keeper/config.xml
```
