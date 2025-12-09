---
title: "ClickHouse® Replication problems"
linkTitle: "Replication problems"
description: >
    Finding and troubleshooting  problems in the `replication_queue` 
keywords: 
   - clickhouse replication	
   - clickhouse check replication status
---

# Common problems & solutions

- If the replication queue does not have any Exceptions only postponed reasons without exceptions just leave ClickHouse® do Merges/Mutations and it will eventually catch up and reduce the number of tasks in `replication_queue`. Number of concurrent merges and fetches can be tuned but if it is done without an analysis of your workload then you may end up in a worse situation. If Delay in queue is going up actions may be needed:

- First simplest approach:
  try to `SYSTEM RESTART REPLICA db.table` (This will DETACH/ATTACH table internally)
 
  

# How to check for replication problems

1. Check `system.replicas` first, cluster-wide. It allows to check if the problem is local to some replica or global, and allows to see the exception.
   allows to answer the following questions:
   - Are there any ReadOnly replicas?
   - Is there the connection to zookeeper active?
   - Is there the exception during table init? (`Code: 999. Coordination::Exception: Transaction failed (No node): Op #1`)
  
2. Check `system.replication_queue`. 
   - How many tasks there / are they moving / are there some very old tasks there? (check `created_time` column, if tasks are 24h old, it is a sign of a problem):
   - You can use this qkb article query: https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-replication-queue/
   - Check if there are tasks with a high number of `num_tries` or `num_postponed` and `postponed_reason` this is a sign of stuck tasks.
   - Check the problematic parts affecting the stuck tasks. You can use columns `new_part_name` or `parts_to_merge`
   - Check which type is the task. If it is `MUTATE_PART` then it is a mutation task. If it is `MERGE_PARTS` then it is a merge task. These tasks can be deleted from the replication queue but `GET_PARTS` should not be deleted.

3. Check `system.errors`

4. Check `system.mutations`:
   - You can check that in the replication queue are stuck tasks of type `MUTATE_PART`, and that those mutations are still executing `system.mutations` using column `is_done`

5. Find the moment when the problem started and collect/analyze / preserve logs from that moment. It is usually during the first steps of a restart/crash

6. Use `part_log` and `system.parts` to gather information of the parts related with the stuck tasks in the replication queue:
   - Check if those parts exist and are active from `system.parts` (use partition_id, name as part and active columns to filter)
   - Extract the part history from `system.part_log`
   - Example query from `part_log`:

```sql
SELECT hostName(), * FROM 
cluster('all-sharded',system.part_log)
WHERE
    hostName() IN ('chi-prod-live-2-0-0','chi-prod-live-2-2-0','chi-prod-live-2-1-0')
    AND table = 'sessions_local'
    AND database = 'analytics'
    AND part_name in ('20230411_33631_33654_3')
```

7. If there are no errors, just everything get slower - check the load (usual system metrics)



## Some stuck replication task for a partition that was already removed or has no data

- This can be easily detected because some exceptions will be in the replication queue that reference a part from a partition that do not exist. Here the most probable scenario is that the partition was dropped and some tasks were left in the queue.

- drop the partition manually once again (it should remove the task)

- If the partition exists but the part is missing (maybe because it is superseded by a newer merged part) then you can try to DETACH/ATTACH the partition.
- Below DML generates the ALTER commands to do this:

```sql
WITH 
    extract(new_part_name, '^[^_]+')  as partition_id
SELECT
    '/* count: ' || count() || ' */\n' ||
    'ALTER TABLE ' || database || '.' || table || ' DETACH PARTITION ID \''|| partition_id || '\';\n' ||
    'ALTER TABLE ' || database || '.' || table || ' ATTACH PARTITION ID \''|| partition_id || '\';\n'
FROM 
    system.replication_queue as rq
GROUP BY
    database, table, partition_id
HAVING sum(num_tries) > 1000 OR count() > 100
ORDER BY count() DESC, sum(num_tries) DESC
FORMAT TSVRaw;
```

## Problem with mutation stuck in the queue

- This can happen if the mutation is finished and, for some reason, the task is not removed from the queue. This can be detected by checking `system.mutations` table and seeing if the mutation is done, but the task is still in the queue.

- kill the mutation (again)

## Replica is not starting because local set of files differs too much

- First try increase the thresholds or set flag `force_restore_data` flag and restarting clickhouse/pod https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/replication#recovery-after-complete-data-loss  

## Replica is in Read-Only MODE

Sometimes, due to crashes, zookeeper unavailability, slowness, or other reasons, some of the tables can be in Read-Only mode. This allows SELECTS but not INSERTS. So we need to do DROP / RESTORE replica procedure.

Just to be clear, this procedure **will not delete any data**, it will just re-create the metadata in zookeeper with the current state of the [ClickHouse replica](/altinity-kb-setup-and-maintenance/altinity-kb-data-migration/add_remove_replica/).
  
```sql
ALTER TABLE table_name DROP DETACHED PARTITION ALL  -- clean detached folder before operation. PARTITION ALL works only for the fresh clickhouse versions
DETACH TABLE table_name;  -- Required for DROP REPLICA
-- Use the zookeeper_path and replica_name from the above query. 
SYSTEM DROP REPLICA 'replica_name' FROM ZKPATH '/table_path_in_zk'; -- It will remove everything from the /table_path_in_zk/replicas/replica_name
ATTACH TABLE table_name;  -- Table will be in readonly mode, because there is no metadata in ZK and after that execute
SYSTEM RESTORE REPLICA table_name;  -- It will detach all partitions, re-create metadata in ZK (like it's new empty table), and then attach all partitions back
SYSTEM SYNC REPLICA table_name; -- Wait for replicas to synchronize parts. Also it's recommended to check `system.detached_parts` on all replicas after recovery is finished.
SELECT name FROM system.detached_parts WHERE table = 'table_name'; -- check for leftovers. See the potential problem here - https://gist.github.com/den-crane/702e4c8a1162dae7c2edf48a7c2dd00d
```


Starting from version 23, it's possible to use syntax [SYSTEM DROP REPLICA \'replica_name\' FROM TABLE db.table](https://clickhouse.com/docs/en/sql-reference/statements/system#drop-replica) instead of the `ZKPATH` variant, but you need to execute the above command from a different replica than the one you want to drop, which is not convenient sometimes. We recommend using the above method because it works with any version and is more reliable.

## Procedure to restore multiple tables in Read-Only mode per replica

It is better to make an approach per replica, because restoring a replica using ON CLUSTER could lead to race conditions that would cause errors and a big stress in zookeeper/keeper


```sql
SELECT 
    '-- Table ' || toString(row_num) || '\n' ||
    'DETACH TABLE `' || database || '`.`' || table || '`;\n' ||
    'SYSTEM DROP REPLICA ''' || replica_name || ''' FROM ZKPATH ''' || zookeeper_path || ''';\n' ||
    'ATTACH TABLE `' || database || '`.`' || table || '`;\n' ||
    'SYSTEM RESTORE REPLICA `' || database || '`.`' || table || '`;\n'
FROM (
    SELECT 
        *,
        rowNumberInAllBlocks() + 1 as row_num
    FROM (
        SELECT 
            database,
            table,
            any(replica_name) as replica_name,
            any(zookeeper_path) as zookeeper_path
        FROM system.replicas
        WHERE is_readonly
        GROUP BY database, table
        ORDER BY database, table
    )
    ORDER BY database, table
) 
FORMAT TSVRaw;
```

This will generate the DDL statements to be executed per replica and generate an ouput that can be saved as an SQL file . It is important to execute the commands per replica in the sequence generated by the above DDL:

- DETACH the table
- DROP REPLICA
- ATTACH the table
- RESTORE REPLICA

If we do this in parallel a table could still be attaching while another query is dropping/restoring the replica in zookeeper, causing errors.

The following bash script will read the generated SQL file and execute the commands sequentially, asking for user input in case of errors. Simply save the generated SQL to a file (e.g. `recovery_commands.sql`) and run the script below (that you can name as `clickhouse_replica_recovery.sh`):

```bash
$ clickhouse_replica_recovery.sh recovery_commands.sql
```


Here the script:

```bash
#!/bin/bash

# ClickHouse Replica Recovery Script
# This script executes DETACH, DROP REPLICA, ATTACH, and RESTORE REPLICA commands sequentially

# Configuration
CLICKHOUSE_HOST="${CLICKHOUSE_HOST:-localhost}"
CLICKHOUSE_PORT="${CLICKHOUSE_PORT:-9000}"
CLICKHOUSE_USER="${CLICKHOUSE_USER:-clickhouse_operator}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:-xxxxxxxxx}"
COMMANDS_FILE="${1:-recovery_commands.sql}"
LOG_FILE="recovery_$(date +%Y%m%d_%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Function to log messages
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to execute a SQL statement with retry logic
execute_sql() {
    local sql="$1"
    local table_num="$2"
    local step_name="$3"
    
    while true; do
        log "${YELLOW}Executing command for Table $table_num - $step_name:${NC}"
        log "$sql"
        
        # Build clickhouse-client command
        local ch_cmd="clickhouse-client --host=$CLICKHOUSE_HOST --port=$CLICKHOUSE_PORT --user=$CLICKHOUSE_USER"
        
        if [ -n "$CLICKHOUSE_PASSWORD" ]; then
            ch_cmd="$ch_cmd --password=$CLICKHOUSE_PASSWORD"
        fi
        
        # Execute the command and capture output and exit code
        local output
        local exit_code
        output=$(echo "$sql" | $ch_cmd 2>&1)
        exit_code=$?
        
        # Log the output
        echo "$output" | tee -a "$LOG_FILE"
        
        if [ $exit_code -eq 0 ]; then
            log "${GREEN}✓ Successfully executed${NC}"
            return 0
        else
            log "${RED}✗ Failed to execute (Exit code: $exit_code)${NC}"
            log "${RED}Error output: $output${NC}"
            
            # Ask user what to do
            while true; do
                echo ""
                log "${MAGENTA}========================================${NC}"
                log "${MAGENTA}Error occurred! Choose an option:${NC}"
                log "${MAGENTA}========================================${NC}"
                echo -e "${YELLOW}[R]${NC} - Retry this command"
                echo -e "${YELLOW}[I]${NC} - Ignore this error and continue to next command in this table"
                echo -e "${YELLOW}[S]${NC} - Skip this entire table and move to next table"
                echo -e "${YELLOW}[A]${NC} - Abort script execution"
                echo ""
                echo -n "Enter your choice (R/I/S/A): "
                
                # Read from /dev/tty to get user input from terminal
                read -r response < /dev/tty
                
                case "${response^^}" in
                    R|RETRY)
                        log "${BLUE}Retrying command...${NC}"
                        break  # Break inner loop to retry
                        ;;
                    I|IGNORE)
                        log "${YELLOW}Ignoring error and continuing to next command...${NC}"
                        return 1  # Return error but continue
                        ;;
                    S|SKIP)
                        log "${YELLOW}Skipping entire table $table_num...${NC}"
                        return 2  # Return special code to skip table
                        ;;
                    A|ABORT)
                        log "${RED}Aborting script execution...${NC}"
                        exit 1
                        ;;
                    *)
                        echo -e "${RED}Invalid option '$response'. Please enter R, I, S, or A.${NC}"
                        ;;
                esac
            done
        fi
    done
}

# Main execution function
main() {
    log "${BLUE}========================================${NC}"
    log "${BLUE}ClickHouse Replica Recovery Script${NC}"
    log "${BLUE}========================================${NC}"
    log "Host: $CLICKHOUSE_HOST:$CLICKHOUSE_PORT"
    log "User: $CLICKHOUSE_USER"
    log "Commands file: $COMMANDS_FILE"
    log "Log file: $LOG_FILE"
    echo ""
    
    # Check if commands file exists
    if [ ! -f "$COMMANDS_FILE" ]; then
        log "${RED}Error: Commands file '$COMMANDS_FILE' not found!${NC}"
        echo ""
        echo "Usage: $0 [commands_file]"
        echo "  commands_file: Path to SQL commands file (default: recovery_commands.sql)"
        echo ""
        echo "Example: $0 my_commands.sql"
        exit 1
    fi
    
    # Process SQL commands from file
    local current_sql=""
    local table_counter=0
    local step_in_table=0
    local failed_count=0
    local success_count=0
    local ignored_count=0
    local skipped_tables=()
    local skip_current_table=false
    
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip empty lines
        if [[ -z "$line" ]] || [[ "$line" =~ ^[[:space:]]*$ ]]; then
            continue
        fi
        
        # Check if this is a comment line indicating a new table
        if [[ "$line" =~ ^[[:space:]]*--[[:space:]]*Table[[:space:]]+([0-9]+) ]]; then
            table_counter="${BASH_REMATCH[1]}"
            step_in_table=0
            skip_current_table=false
            log ""
            log "${BLUE}========================================${NC}"
            log "${BLUE}Processing Table $table_counter${NC}"
            log "${BLUE}========================================${NC}"
            continue
        elif [[ "$line" =~ ^[[:space:]]*-- ]]; then
            # Skip other comment lines
            continue
        fi
        
        # Skip if we're skipping this table
        if [ "$skip_current_table" = true ]; then
            # Check if line ends with semicolon to count statements
            if [[ "$line" =~ \;[[:space:]]*$ ]]; then
                step_in_table=$((step_in_table + 1))
            fi
            continue
        fi
        
        # Accumulate the SQL statement
        current_sql+="$line "
        
        # Check if we have a complete statement (ends with semicolon)
        if [[ "$line" =~ \;[[:space:]]*$ ]]; then
            step_in_table=$((step_in_table + 1))
            
            # Determine the step name
            local step_name=""
            if [[ "$current_sql" =~ ^[[:space:]]*DETACH ]]; then
                step_name="DETACH"
            elif [[ "$current_sql" =~ ^[[:space:]]*SYSTEM[[:space:]]+DROP[[:space:]]+REPLICA ]]; then
                step_name="DROP REPLICA"
            elif [[ "$current_sql" =~ ^[[:space:]]*ATTACH ]]; then
                step_name="ATTACH"
            elif [[ "$current_sql" =~ ^[[:space:]]*SYSTEM[[:space:]]+RESTORE[[:space:]]+REPLICA ]]; then
                step_name="RESTORE REPLICA"
            fi
            
            log ""
            log "Step $step_in_table/4: $step_name"
            
            # Execute the statement
            local result
            execute_sql "$current_sql" "$table_counter" "$step_name"
            result=$?
            
            if [ $result -eq 0 ]; then
                success_count=$((success_count + 1))
                sleep 1  # Small delay between commands
            elif [ $result -eq 1 ]; then
                # User chose to ignore this error
                failed_count=$((failed_count + 1))
                ignored_count=$((ignored_count + 1))
                sleep 1
            elif [ $result -eq 2 ]; then
                # User chose to skip this table
                skip_current_table=true
                skipped_tables+=("$table_counter")
                log "${YELLOW}Skipping remaining commands for Table $table_counter${NC}"
            fi
            
            # Reset current_sql for next statement
            current_sql=""
        fi
    done < "$COMMANDS_FILE"
    
    # Summary
    log ""
    log "${BLUE}========================================${NC}"
    log "${BLUE}Execution Summary${NC}"
    log "${BLUE}========================================${NC}"
    log "Total successful commands: ${GREEN}$success_count${NC}"
    log "Total failed commands: ${RED}$failed_count${NC}"
    log "Total ignored errors: ${YELLOW}$ignored_count${NC}"
    log "Total tables processed: $table_counter"
    
    if [ ${#skipped_tables[@]} -gt 0 ]; then
        log "Skipped tables: ${YELLOW}${skipped_tables[*]}${NC}"
    fi
    
    log "Log file: $LOG_FILE"
    
    if [ $failed_count -eq 0 ]; then
        log "${GREEN}All commands executed successfully!${NC}"
        exit 0
    else
        log "${YELLOW}Some commands failed or were ignored. Please check the log file.${NC}"
        exit 1
    fi
}

# Run the main function
main

```

