---
title: "High CPU usage"
linkTitle: "High CPU usage"
description: >
    High CPU usage
---
In general, it is a NORMAL situation for clickhouse that while processing a huge dataset it can use a lot of (or all of) the server resources. It is 'by design' - just to make the answers faster.

The main directions to reduce the CPU usage **is to review the schema / queries** to limit the amount of the data which need to be processed, and to plan the resources in a way when single running query will not impact the others.

Any attempts to reduce the CPU usage will end up with slower queries!

### How to slow down queries to reduce the CPU usage

If it is acceptable for you - please check the following options for limiting the CPU usage:

1) setting `max_threads`: reducing the number of threads that are allowed to use one request. Fewer threads = more free cores for other requests.  By default, it's allowed to take half of the available CPU cores, adjust only when needed. So if if you have 10 cores then `max_threads = 10` will work about twice faster than `max_threads=5`, but will take 100% or CPU. (max_threads=5 will use half of CPUs so 50%).

2) setting `os_thread_priority`: increasing niceness for selected requests. In this case, the operating system, when choosing which of the running processes to allocate processor time, will prefer processes with lower niceness. 0 is the default niceness. The higher the niceness, the lower the priority of the process. The maximum niceness value is 19.

These are custom settings that can be tweaked in several ways:

1. by specifying them when connecting a client, for example

    ```bash
    clickhouse-client --os_thread_priority=19 -q 'SELECT max (number) from numbers (100000000)'

    echo 'SELECT max(number) from numbers(100000000)' | curl 'http://localhost:8123/?os_thread_priority=19' --data-binary @-
    ```

1. via dedicated API / connection parameters in client libraries

1. using the SQL command SET (works only within the session)

    ```sql
    SET os_thread_priority = 19;
    SELECT max(number) from numbers(100000000)
    ```

1. using different profiles of settings for different users. Something like

    ```xml
    <?xml version="1.0"?>
    <yandex>
        <profiles>
            <default>
            ...
            </default>

            <lowcpu>
                <os_thread_priority>19</os_thread_priority>
                <max_threads>4</max_threads>
            </lowcpu>
        </profiles>

        <!-- Users and ACL. -->
        <users>
            <!-- If user name was not specified, 'default' user is used. -->
            <limited_user>
                <password>123</password>
                <networks>
                    <ip>::/0</ip>
                </networks>
                <profile>lowcpu</profile>

                <!-- Quota for user. -->
                <quota>default</quota>
            </limited_user>
        </users>

    </yandex>
    ```

There are also plans to introduce a system of more flexible control over the assignment of resources to different requests.

Also, if these are manually created queries, then you can try to discipline users by adding quotas to them (they can be formulated as "you can read no more than 100GB of data per hour" or "no more than 10 queries", etc.)

If these are automatically generated queries, it may make sense to check if there is no way to write them in a more efficient way.
