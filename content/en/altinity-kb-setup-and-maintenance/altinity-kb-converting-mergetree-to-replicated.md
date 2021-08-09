---
title: "Converting MergeTree to Replicated"
linkTitle: "Converting MergeTree to Replicated"
description: >
    Converting MergeTree to Replicated
---

Options here are:

1. Use`INSERT INTO foo_replicated SELECT * FROM foo` .
2. Create table aside and attach all partition from the existing table then drop original table \(uses hard links don't require extra disk space\). `ALTER TABLE foo_replicated ATTACH PARTITION ID 'bar' FROM 'foo'` You can easily auto generate those commands using a query like: `SELECT DISTINCT 'ALTER TABLE foo_replicated ATTACH PARTITION ID '' || partition_id || '' FROM foo' from system.parts WHERE table = 'foo'`
3. Do it 'in place' using some file manipulation. see the procedure described here: [https://clickhouse.tech/docs/en/engines/table-engines/mergetree-family/replication/\#converting-from-mergetree-to-replicatedmergetree](https://clickhouse.tech/docs/en/engines/table-engines/mergetree-family/replication/#converting-from-mergetree-to-replicatedmergetree)
4. Do a backup of MergeTree and recover as ReplicatedMergeTree. [https://github.com/AlexAkulov/clickhouse-backup/blob/master/Examples.md\#how-to-convert-mergetree-to-replicatedmegretree](https://github.com/AlexAkulov/clickhouse-backup/blob/master/Examples.md#how-to-convert-mergetree-to-replicatedmegretree)
5. Embedded command for that should be added in future.

© 2021 Altinity Inc. All rights reserved.

