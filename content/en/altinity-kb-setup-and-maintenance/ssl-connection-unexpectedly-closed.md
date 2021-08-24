---
title: "SSL connection unexpectedly closed"
linkTitle: "SSL connection unexpectedly closed"
description: >
    SSL connection unexpectedly closed
---
ClickHouse doesn't probe CA path which is default on CentOS and Amazon Linux.

## ClickHouse client

```markup
cat /etc/clickhouse-client/conf.d/openssl-ca.xml
<config>
    <openSSL>
        <client> <!-- Used for connection to server's secure tcp port -->
            <caConfig>/etc/ssl/certs</caConfig>
        </client>
    </openSSL>
</config>
```

## ClickHouse server

```markup
cat /etc/clickhouse-server/conf.d/openssl-ca.xml
<config>
    <openSSL>
        <server>  <!-- Used for https server AND secure tcp port -->
            <caConfig>/etc/ssl/certs</caConfig>
        </server>
        <client>  <!-- Used for connecting to https dictionary source and secured Zookeeper communication -->
            <caConfig>/etc/ssl/certs</caConfig>
        </client>
    </openSSL>
</config>
```

[https://github.com/ClickHouse/ClickHouse/issues/17803](https://github.com/ClickHouse/ClickHouse/issues/17803)

[https://github.com/ClickHouse/ClickHouse/issues/18869](https://github.com/ClickHouse/ClickHouse/issues/18869)
