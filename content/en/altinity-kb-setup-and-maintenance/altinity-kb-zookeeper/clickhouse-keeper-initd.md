---
title: "clickhouse-keeper-initd"
linkTitle: "clickhouse-keeper-initd"
weight: 100
description: >-
     clickhouse-keeper-initd
---

## clickhouse-keeper-initd

An init.d script for clickhouse-keeper.
This example is based on zkServer.sh
```bash
#!/bin/bash
### BEGIN INIT INFO
# Provides:          clickhouse-keeper
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Required-Start:
# Required-Stop:
# Short-Description: Start keeper daemon
# Description: Start keeper daemon
### END INIT INFO

NAME=clickhouse-keeper
ZOOCFGDIR=/etc/$NAME
ZOOCFG="$ZOOCFGDIR/keeper.xml"
ZOO_LOG_DIR=/var/log/$NAME
USER=clickhouse
GROUP=clickhouse
ZOOPIDDIR=/var/run/$NAME
ZOOPIDFILE=$ZOOPIDDIR/$NAME.pid
SCRIPTNAME=/etc/init.d/$NAME

#echo "Using config: $ZOOCFG" >&2
ZOOCMD="clickhouse-keeper -C ${ZOOCFG} start --daemon"

# ensure PIDDIR exists, otw stop will fail
mkdir -p "$(dirname "$ZOOPIDFILE")"

if [ ! -w "$ZOO_LOG_DIR" ] ; then
mkdir -p "$ZOO_LOG_DIR"
fi

case $1 in
start)
    echo -n "Starting keeper ... "
    if [ -f "$ZOOPIDFILE" ]; then
      if kill -0 `cat "$ZOOPIDFILE"` > /dev/null 2>&1; then
         echo already running as process `cat "$ZOOPIDFILE"`.
         exit 0
      fi
    fi
    sudo -u clickhouse `echo "$ZOOCMD"`
    if [ $? -eq 0 ]
    then
      pgrep -f "$ZOOCMD" > "$ZOOPIDFILE"
      echo "PID:" `cat $ZOOPIDFILE`
      if [ $? -eq 0 ];
      then
        sleep 1
        echo STARTED
      else
        echo FAILED TO WRITE PID
        exit 1
      fi
    else
      echo SERVER DID NOT START
      exit 1
    fi
    ;;
start-foreground)
    sudo -u clickhouse clickhouse-keeper -C "$ZOOCFG" start
    ;;
print-cmd)
    echo "sudo -u clickhouse ${ZOOCMD}"
    ;;
stop)
    echo -n "Stopping keeper ... "
    if [ ! -f "$ZOOPIDFILE" ]
    then
      echo "no keeper to stop (could not find file $ZOOPIDFILE)"
    else
      ZOOPID=$(cat "$ZOOPIDFILE")
      echo $ZOOPID
      kill $ZOOPID
      while true; do
         sleep 3
         if kill -0 $ZOOPID > /dev/null 2>&1; then
            echo $ZOOPID is still running
         else
            break
         fi
      done
      rm "$ZOOPIDFILE"
      echo STOPPED
    fi
    exit 0
    ;;
restart)
    shift
    "$0" stop ${@}
    sleep 3
    "$0" start ${@}
    ;;
status)
    clientPortAddress="localhost"
    clientPort=2181
    STAT=`echo srvr | nc $clientPortAddress $clientPort 2> /dev/null | grep Mode`
    if [ "x$STAT" = "x" ]
    then
        echo "Error contacting service. It is probably not running."
        exit 1
    else
        echo $STAT
        exit 0
    fi
    ;;
*)
    echo "Usage: $0 {start|start-foreground|stop|restart|status|print-cmd}" >&2

esac
```
