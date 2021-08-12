---
title: "Mutations"
linkTitle: "Mutations"
description: >
    ALTER UPDATE / DELETE
---
Q. How to know if `ALTER TABLE … DELETE/UPDATE mutation ON CLUSTER` was finished successfully on all the nodes?

A. mutation status in system.mutations is local to each replica, so use

```text
SELECT hostname(), * FROM clusterAllReplicas('your_cluster_name', system.mutations);
-- you can also add WHERE conditions to that query if needed.
```

Look on `is_done` and `latest_fail_reason` columns
