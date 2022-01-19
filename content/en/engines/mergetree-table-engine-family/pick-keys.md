---
title: "How to pick an ORDER BY / PRIMARY KEY / PARTITION BY for the MergeTree-family table"
linkTitle: "Proper ordering and partitioning the MergeTree tables"
weight: 100
description: >-
     How to pick an ORDER BY / PRIMARY KEY / PARTITION BY for the MergeTree table.
---

## How to pick an ORDER BY / PRIMARY KEY

good order by usually have 3 to 5 columns, from lowest cardinal on the left (and the most important for filtering) to highest cardinal (and less important for filtering).
 
Practical approach to create an good ORDER BY for a table:

1. Pick the columns you use in filtering always
2. The most important for filtering and the lowest cardinal should be the left-most. Typically it's something like `tenant_id`
3. Next column is more cardinal, less important. It can be rounded time sometimes, or `site_id`, or `source_id`, or `group_id` or something similar.
4. repeat p.3 once again (or few times)
5. if you added already all columns important for filtering and you still not addressing a single row with you pk - you can add more columns which can help to put similar records close to each other (to improve the compression)
6. if you have something like hierarchy / tree-like relations between the columns - put there the records from 'root' to 'leaves' for example (continent, country, cityname). This way clickhouse can do lookup by country / city even if continent is not specified (it will just 'check all continents')
special variants of MergeTree may require special ORDER BY to make the record unique etc.

Some examples or good order by
```
ORDER BY (tenantid, site_id, utm_source, clientid, timestamp)
```

```
ORDER BY (site_id, toStartOfHour(timestamp), sessionid, timestamp )
PRIMARY KEY (site_id, toStartOfHour(timestamp), sessionid)
```

### For Summing / Aggregating

All dimentions go to ORDER BY, all metrics - outside of that. 

The most important for filtering columns with the lowest cardinality should be the left most.

If number of dimentions is high it's typically make sense to use a prefix of ORDER BY as a PRIMARY KEY to avoid polluting sparse index.

Examples:

```
ORDER BY (tenant_id, hour, country_code, team_id, group_id, source_id)
PRIMARY KEY (tenant_id, hour, country_code, team_id)
```

### For Replacing / Collapsing 

You need to keep all 'mutable' columns outside of ORDER BY, and have some unique id (a base to collapse duplicates) inside. 
Typically the right-most column is some row identifier. And it's often not needed in sparse index (so PRIMARY KEY can be a prefix of ORDER BY)
The rest consideration are the same. 

Examples:

```
ORDER BY (tenantid, site_id, eventid) --  utm_source is mutable, while tenantid, site_id is not
PRIMARY KEY (tenantid, site_id) -- eventid is not used for filtering, needed only for collapsing duplicates
```

## PARTITION BY 

* Good size for single partition is something like 1-300Gb.
* For Summing/Replacing a but smaller (400Mb-40Gb)
* Better to avoid touching more that few dozens of partitions with typical SELECT query.
* Single insert should bring data to one or few partitions.
* The number of partitons in table - dozen or hundreds, not thousands.

The size of partitions you can check in system.parts table.

Examples:

```
-- for time-series:
PARTITION BY toYYYY(timestamp)          -- long retention, not too much data
PARTITION BY toYYYYMM(timestamp)        --  
PARTITION BY toMonday(timestamp)        -- 
PARTITION BY toDate(timestamp)          --
PARTITION BY toStartOfHour(timestamp)   -- short retention, lot of data

-- for table with some incremental (non time-bounded) counter

PARTITION BY intDiv(transaction_id, 1000000)

-- for some dimention tables (always requested with WHERE userid)
PARTITION BY userid % 16
```

For the small tables (smaller than few gigabytes) partitioning is usually not needed at all (just skip `PARTITION BY` expresssion when you create the table).

