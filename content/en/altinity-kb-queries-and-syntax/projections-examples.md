---
title: "Projections examples"
linkTitle: "Projections examples"
description: >
    Projections examples
---
## Aggregating projections

```sql
create table z(Browser String, Country UInt8, F Float64)
Engine=MergeTree
order by Browser;

insert into z
     select toString(number%9999),
     number%33, 1
from numbers(100000000);

--Q1)
select sum(F), Browser
from z
group by Browser format Null;
Elapsed: 0.205 sec. Processed 100.00 million rows

--Q2)
select sum(F), Browser, Country
from z
group by Browser,Country format Null;
Elapsed: 0.381 sec. Processed 100.00 million rows

--Q3)
select sum(F),count(), Browser, Country
from z
group by Browser,Country format Null;
Elapsed: 0.398 sec. Processed 100.00 million rows

alter table z add projection pp
   (select Browser,Country, count(), sum(F)
    group by Browser,Country);
alter table z materialize projection pp;

---- 0 = don't use proj, 1 = use projection
set allow_experimental_projection_optimization=1;

--Q1)
select sum(F), Browser
from z
group by Browser format Null;
Elapsed: 0.003 sec. Processed 22.43 thousand rows

--Q2)
select sum(F), Browser, Country
from z
group by Browser,Country format Null;
Elapsed: 0.004 sec. Processed 22.43 thousand rows

--Q3)
select sum(F),count(), Browser, Country
from z
group by Browser,Country format Null;
Elapsed: 0.005 sec. Processed 22.43 thousand rows
```


## See also 

* Amos Bird - kuaishou.com - Projections in ClickHouse. [slides](https://github.com/ClickHouse/clickhouse-presentations/blob/master/percona2021/projections.pdf). [video](https://youtu.be/jJ5VuLr2k5k?list=PLWhC0zeznqkkNYzcvHEfZ8hly3Cu9ojKk)
* [Documentation](https://clickhouse.tech/docs/en/engines/table-engines/mergetree-family/mergetree/#projections)
* [tinybird blog article](https://blog.tinybird.co/2021/07/09/projections/) 
