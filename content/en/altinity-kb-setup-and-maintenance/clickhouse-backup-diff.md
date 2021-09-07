---
title: "differential backups using clickhouse-backup"
linkTitle: "differential backups using clickhouse-backup"
description: >
    differential backups using clickhouse-backup
---
### differential backups using clickhouse-backup

1. Download the latest clickhouse-backup for your platform https://github.com/AlexAkulov/clickhouse-backup/releases

```bash
# ubuntu / debian

wget https://github.com/AlexAkulov/clickhouse-backup/releases/download/v1.0.0/clickhouse-backup_1.0.0_amd64.deb 
sudo dpkg -i clickhouse-backup_1.0.0_amd64.deb 

# centos / redhat / fedora 

sudo yum install https://github.com/AlexAkulov/clickhouse-backup/releases/download/v1.0.0/clickhouse-backup-1.0.0-1.x86_64.rpm

# other platforms
wget https://github.com/AlexAkulov/clickhouse-backup/releases/download/v1.0.0/clickhouse-backup.tar.gz
sudo mkdir /etc/clickhouse-backup/
sudo mv clickhouse-backup/config.yml /etc/clickhouse-backup/config.yml.example
sudo mv clickhouse-backup/clickhouse-backup /usr/bin/
rm -rf clickhouse-backup clickhouse-backup.tar.gz
```   

2. Create a runner script for the crontab

```bash
mkdir /opt/clickhouse-backup-diff/

cat << 'END' > /opt/clickhouse-backup-diff/clickhouse-backup-cron.sh

#!/bin/bash
set +x
command_line_argument=$1

backup_name=$(date +%Y-%M-%d-%H-%M-%S)

echo "Creating local backup '${backup_name}' (full, using hardlinks)..."
clickhouse-backup create "${backup_name}"

if [[ "run_diff" == "${command_line_argument}" && "2" -le "$(clickhouse-backup list local | wc -l)" ]]; then
  prev_backup_name="$(clickhouse-backup list local | tail -n 2 | head -n 1 | cut -d " " -f 1)"
  echo "Uploading the backup '${backup_name}' as diff from the previous backup ('${prev_backup_name}')"
  clickhouse-backup upload --diff-from "${prev_backup_name}" "${backup_name}"
elif [[ "" == "${command_line_argument}" ]]; then
  echo "Uploading the backup '${backup_name}, and removing old unneeded backups"
  KEEP_BACKUPS_LOCAL=1 KEEP_BACKUPS_REMOTE=1 clickhouse-backup upload "${backup_name}"
fi
END

chmod +x /opt/clickhouse-backup-diff/clickhouse-backup-cron.sh
```

3. Create confuguration for clickhouse-backup 

```
# Check the example: /etc/clickhouse-backup/config.yml.example 
vim /etc/clickhouse-backup/config.yml
```

4. Edit the crontab

```
crontab -e

# full backup at 0:00 Monday
0 0 * * 1 clickhouse /opt/clickhouse-backup-diff/clickhouse-backup-cron.sh
# differential backup every hour (except of 00:00) Monday 
0 1-23 * * 1 clickhouse /opt/clickhouse-backup-diff/clickhouse-backup-cron.sh run_diff
# differential backup every hour Sunday, Tuesday-Saturday
0 */1 * * 0,2-6 clickhouse /opt/clickhouse-backup-diff/clickhouse-backup-cron.sh run_diff
```

5. Recover the last backup:

```bash 
last_remote_backup="$(clickhouse-backup list remote | tail -n 1 | cut -d " " -f 1)"
clickhouse-backup download "${last_remote_backup}"
clickhouse-backup restore --rm "${last_remote_backup}"
```
