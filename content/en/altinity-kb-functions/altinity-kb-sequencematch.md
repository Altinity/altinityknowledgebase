---
title: "sequenceMatch"
linkTitle: "sequenceMatch"
description: >
    sequenceMatch
---
## Question

I expect the sequence here to only match once as a is only directly after a once - but it matches with gaps. Why is that?

```sql
SELECT sequenceCount('(?1)(?2)')(sequence, page ILIKE '%a%', page ILIKE '%a%') AS sequences
  FROM values('page String, sequence UInt16', ('a', 1), ('a', 2), ('b', 3), ('b', 4), ('a', 5), ('b', 6), ('a', 7))

2 # ??
```

## Answer

`sequenceMatch` just ignores the events which don't match the condition. Check that:

```sql
SELECT sequenceMatch('(?1)(?2)')(sequence,page='a',page='b') AS sequences　FROM values( 'page String, sequence UInt16' , ('a', 1), ('c',2), ('b', 3));
1 # ??

SELECT sequenceMatch('(?1).(?2)')(sequence,page='a',page='b') AS sequences　FROM values( 'page String, sequence UInt16' , ('a', 1), ('c',2), ('b', 3));
0 # ???

SELECT sequenceMatch('(?1)(?2)')(sequence,page='a',page='b', page NOT IN ('a','b')) AS sequences　from values( 'page String, sequence UInt16' , ('a', 1), ('c',2), ('b', 3));
0 # !

SELECT sequenceMatch('(?1).(?2)')(sequence,page='a',page='b', page NOT IN ('a','b')) AS sequences　from values( 'page String, sequence UInt16' , ('a', 1), ('c',2), ('b', 3));
1 #
```

So for your example - just introduce one more 'nothing matched' condition:

```sql
SELECT sequenceCount('(?1)(?2)')(sequence, page ILIKE '%a%', page ILIKE '%a%', NOT (page ILIKE '%a%')) AS sequences
FROM values('page String, sequence UInt16', ('a', 1), ('a', 2), ('b', 3), ('b', 4), ('a', 5), ('b', 6), ('a', 7))
```
