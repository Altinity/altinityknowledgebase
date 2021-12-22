---
title: "http handler example"
linkTitle: "http_handlers"
weight: 100
description: >-
     http handler example
---

## http handler example (how to disable /play)

```xml
# cat /etc/clickhouse-server/config.d/play_disable.xml
<?xml version="1.0" ?>
<yandex>
     <http_handlers>
        <rule>
            <url>/play</url>
            <methods>GET</methods>
            <handler>
                <type>static</type>
                <status>403</status>
                <content_type>text/plain; charset=UTF-8</content_type>
                <response_content></response_content>
            </handler>
        </rule>
        <defaults/>         <!-- handler to save default handlers ?query / ping -->
    </http_handlers>
</yandex>
```
