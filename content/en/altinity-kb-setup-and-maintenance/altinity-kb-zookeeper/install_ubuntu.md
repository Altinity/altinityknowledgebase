---
title: "Install standalone Zookeeper for ClickHouse on Ubuntu / Debian"
linkTitle: "Zookeeper install on Ubuntu"
weight: 100
description: >-
     Install standalone Zookeeper for ClickHouse on Ubuntu / Debian.
---

## Reference script to install standalone Zookeeper for Ubuntu / Debian

Tested on Ubuntu 20.

```bash
# install java runtime environment
sudo apt-get update
sudo apt install default-jre

# prepare folders, logs folder should be on the low-latency disk.
sudo mkdir -p /var/lib/zookeeper/data /var/lib/zookeeper/logs /etc/zookeeper /var/log/zookeeper /opt 

# download and install files 
export ZOOKEEPER_VERSION=3.6.3
wget https://dlcdn.apache.org/zookeeper/zookeeper-${ZOOKEEPER_VERSION}/apache-zookeeper-${ZOOKEEPER_VERSION}-bin.tar.gz -O /tmp/apache-zookeeper-${ZOOKEEPER_VERSION}-bin.tar.gz
sudo tar -xvf /tmp/apache-zookeeper-${ZOOKEEPER_VERSION}-bin.tar.gz -C /opt
rm -rf /tmp/apache-zookeeper-${ZOOKEEPER_VERSION}-bin.tar.gz

# create the user 
sudo groupadd -r zookeeper
sudo useradd -r -g zookeeper --home-dir=/var/lib/zookeeper --shell=/bin/false zookeeper

# symlink pointing to the used version of zookeeper distibution
sudo ln -s /opt/apache-zookeeper-${ZOOKEEPER_VERSION}-bin /opt/zookeeper 
sudo chown -R zookeeper:zookeeper /var/lib/zookeeper /var/log/zookeeper /etc/zookeeper /opt/apache-zookeeper-${ZOOKEEPER_VERSION}-bin
sudo chown -h zookeeper:zookeeper /opt/zookeeper

# shortcuts in /usr/local/bin/
echo -e '#!/usr/bin/env bash\n/opt/zookeeper/bin/zkCli.sh "$@"'             | sudo tee /usr/local/bin/zkCli
echo -e '#!/usr/bin/env bash\n/opt/zookeeper/bin/zkServer.sh "$@"'          | sudo tee /usr/local/bin/zkServer
echo -e '#!/usr/bin/env bash\n/opt/zookeeper/bin/zkCleanup.sh "$@"'         | sudo tee /usr/local/bin/zkCleanup
echo -e '#!/usr/bin/env bash\n/opt/zookeeper/bin/zkSnapShotToolkit.sh "$@"' | sudo tee /usr/local/bin/zkSnapShotToolkit
echo -e '#!/usr/bin/env bash\n/opt/zookeeper/bin/zkTxnLogToolkit.sh "$@"'   | sudo tee /usr/local/bin/zkTxnLogToolkit
sudo chmod +x /usr/local/bin/zkCli /usr/local/bin/zkServer /usr/local/bin/zkCleanup /usr/local/bin/zkSnapShotToolkit /usr/local/bin/zkTxnLogToolkit

# put in the config
sudo cp opt/zookeeper/conf/* /etc/zookeeper
cat <<EOF | sudo tee /etc/zookeeper/zoo.cfg
initLimit=20
syncLimit=10
maxSessionTimeout=60000000
maxClientCnxns=2000
preAllocSize=131072
snapCount=3000000
dataDir=/var/lib/zookeeper/data
dataLogDir=/var/lib/zookeeper/logs # use low-latency disk!
clientPort=2181
#clientPortAddress=nthk-zoo1.localdomain
autopurge.snapRetainCount=10
autopurge.purgeInterval=1
4lw.commands.whitelist=*
EOF
sudo chown -R zookeeper:zookeeper /etc/zookeeper

# create systemd service file
cat <<EOF | sudo tee /etc/systemd/system/zookeeper.service
[Unit]
Description=Zookeeper Daemon
Documentation=http://zookeeper.apache.org
Requires=network.target
After=network.target

[Service]
Type=forking
WorkingDirectory=/var/lib/zookeeper
User=zookeeper
Group=zookeeper
Environment=ZK_SERVER_HEAP=1536 # in megabytes, adjust to ~ 80-90% of avaliable RAM (more than 8Gb is rather overkill)
Environment=SERVER_JVMFLAGS="-Xms256m -XX:+AlwaysPreTouch -Djute.maxbuffer=8388608 -XX:MaxGCPauseMillis=50"
Environment=ZOO_LOG_DIR=/var/log/zookeeper
ExecStart=/opt/zookeeper/bin/zkServer.sh start /etc/zookeeper/zoo.cfg
ExecStop=/opt/zookeeper/bin/zkServer.sh stop /etc/zookeeper/zoo.cfg
ExecReload=/opt/zookeeper/bin/zkServer.sh restart /etc/zookeeper/zoo.cfg
TimeoutSec=30
Restart=on-failure

[Install]
WantedBy=default.target
EOF

# start zookeeper
sudo systemctl daemon-reload
sudo systemctl start zookeeper.service 

# check status etc.
echo stat | nc localhost 2181
echo ruok | nc localhost 2181
echo mntr | nc localhost 2181
```
