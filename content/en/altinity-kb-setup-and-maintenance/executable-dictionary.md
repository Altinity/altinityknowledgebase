---
title: "Use an executable dictionary as cron task"
linkTitle: "Use an executable dictionary as cron task"
weight: 100
description: >
    If you need to execute scheduled tasks, you can use an executable dictionary like it was a cron task.
---

### Rationale

Imagine that we need to restart clickhouse-server every saturday at 10:00 AM. We can use an executable dictionary to do this. Here is the approach and code necessary to do this. It can be used for other operations like INSERT into tables or execute some other imaginative tasks that need an scheduled execution.

Let's create a simple table to register all the restarts scheduled by this dictionary:


```sql
CREATE TABLE restart_table
(
    restart_datetime DateTime
)
ENGINE = TinyLog
```

### Configuration

This is the ClickHouse configuration file we will be using for executable dictionaries. The dictionary is a dummy one (ignore the format and other stuff, we need format in the dict definition because if not it will fail loading), we don’t need it to do anything, just execute a script that has all the logic. The scheduled time is defined in the LIFETIME property of the dictionary (every 5 minutes dictionary will be refreshed and subsequently the script executed). Also for this case we need to load it on startup time setting lazy loading of dicts to false.

```xml
<!-- cat restart_dict.xml -->
<clickhouse>
    <dictionaries_config>/etc/clickhouse-server/config.d/*_dict.xml</dictionaries_config>
    <dictionaries_lazy_load>false</dictionaries_lazy_load>
    <dictionary>
        <name>restart_dict</name>
        <structure>
            <id>
                <name>restart_id</name>
                <type>UInt64</type>
            </id>
        </structure>
        <source>
            <executable>
                <command>restart_dict.sh</command>
                <execute_direct>true</execute_direct>
                <format>CSV</format>
            </executable>
        </source>
        <layout>
            <flat/>
        </layout>
        <lifetime>300</lifetime>
    </dictionary>
</clickhouse>
```



### Action

Now the restart logic (which can be different for other needs). In this case it will do nothing until the restart windows comes. During the restart window, we check if there has been a restart in the same window timeframe (if window is an hour the condition should be 1h). The script will issue a  `SYSTEM SHUTDOWN` command to restart the server. The script will also insert a record in the restart_table to register the restart time. 

```bash
#!/bin/bash

CLICKHOUSE_USER="admin"
CLICKHOUSE_PASSWORD="xxxxxxxxx"

# Check if today is Saturday and the time is 10:00 AM CET or later
# Get current day of week (1-7, where 7 is Sunday)
# reload time for dict is 300 secs / 10 mins
current_day=$(date +%u)
# Get current time in hours and minutes
current_time=$(date +%H%M)

# Check if today is Saturday (6) and the time is between 10:00 AM and 11:00 AM
if [[ $current_day -eq 6 && $current_time -ge 1000 && $current_time -lt 1100 ]]; then
    # Get current date and time as timestamp
    current_timestamp=$(date +%s)
    last_restart_timestamp=$(clickhouse-client --user $CLICKHOUSE_USER --password $CLICKHOUSE_PASSWORD --query "SELECT max(toUnixTimestamp(restart_datetime)) FROM restart_table")
    # Check if the last restart timestamp is within last hour, if not then restart
    if [[ $(( current_timestamp - last_restart_timestamp )) -ge 3600 ]]; then
        # Push data to log table and restart
        echo $current_timestamp | clickhouse-client --user $CLICKHOUSE_USER --password $CLICKHOUSE_PASSWORD --query "INSERT INTO restart_table FORMAT TSVRaw"
        clickhouse-client --user $CLICKHOUSE_USER --password $CLICKHOUSE_PASSWORD --query "SYSTEM SHUTDOWN"
    fi
fi
```
