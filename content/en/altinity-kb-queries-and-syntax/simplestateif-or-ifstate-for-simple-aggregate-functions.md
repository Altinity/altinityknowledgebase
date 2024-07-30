---
title: "Simple aggregate functions & combinators"
linkTitle: "Simple aggregate functions & combinators"
description: >
    Simple aggregate functions & combinators
---
### Q. What is SimpleAggregateFunction? Are there advantages to use it instead of  AggregateFunction in AggregatingMergeTree?

The ClickHouse® SimpleAggregateFunction can be used for those aggregations when the function state is exactly the same as the resulting function value. Typical example is `max` function: it only requires storing the single value which is already maximum, and no extra steps needed to get the final value. In contrast `avg` need to store two numbers - sum & count, which should be divided to get the final value of aggregation (done by the `-Merge` step at the very end).

<table>
  <thead>
    <tr>
      <th style="text-align:left"></th>
      <th style="text-align:left">SimpleAggregateFunction</th>
      <th style="text-align:left">AggregateFunction</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="text-align:left">inserting</td>
      <td style="text-align:left">
        <p>accepts the value of underlying type OR</p>
        <p>a value of corresponding SimpleAggregateFunction type
          <br />
          <br /><code>CREATE TABLE saf_test<br />(  x SimpleAggregateFunction(max, UInt64) )<br />ENGINE=AggregatingMergeTree<br />ORDER BY tuple();<br /><br />INSERT INTO saf_test VALUES (1);<br />INSERT INTO saf_test SELECT max(number) FROM numbers(10);<br />INSERT INTO saf_test SELECT maxSimpleState(number) FROM numbers(20);</code>
          <br
          />
        </p>
      </td>
      <td style="text-align:left">ONLY accepts the state of same aggregate function calculated using -State
        combinator</td>
    </tr>
    <tr>
      <td style="text-align:left">storing</td>
      <td style="text-align:left">Internally store just a value of underlying type</td>
      <td style="text-align:left">function-specific state</td>
    </tr>
    <tr>
      <td style="text-align:left">storage usage</td>
      <td style="text-align:left">typically is much better due to better compression/codecs</td>
      <td style="text-align:left">
        <p>in very rare cases it can be more optimal than raw values</p>
        <p>adaptive granularity doesn't work for large states</p>
      </td>
    </tr>
    <tr>
      <td style="text-align:left">reading raw value per row</td>
      <td style="text-align:left">you can access it directly</td>
      <td style="text-align:left">you need to use <code>finalizeAgggregation</code> function</td>
    </tr>
    <tr>
      <td style="text-align:left">using aggregated value</td>
      <td style="text-align:left">
        <p>just</p>
        <p><code>select max(x) from test;</code>
        </p>
      </td>
      <td style="text-align:left">
        <p>you need to use <code>-Merge</code> combinator
          <br /><code>select maxMerge(x) from test;</code>
        </p>
        <p></p>
      </td>
    </tr>
    <tr>
      <td style="text-align:left">memory usage</td>
      <td style="text-align:left">typically less memory needed (in some corner cases even 10 times)</td>
      <td
      style="text-align:left">typically uses more memory, as every state can be quite complex</td>
    </tr>
    <tr>
      <td style="text-align:left">performance</td>
      <td style="text-align:left">typically better, due to lower overhead</td>
      <td style="text-align:left">worse</td>
    </tr>
  </tbody>
</table>

See also:

* [Altinity Knowledge Base article on AggregatingMergeTree](../../engines/mergetree-table-engine-family/aggregatingmergetree/)
* [https://github.com/ClickHouse/ClickHouse/pull/4629](https://github.com/ClickHouse/ClickHouse/pull/4629)
* [https://github.com/ClickHouse/ClickHouse/issues/3852](https://github.com/ClickHouse/ClickHouse/issues/3852)

### Q. How maxSimpleState combinator result differs from plain max?

They produce the same result, but types differ (the first have `SimpleAggregateFunction` datatype). Both can be pushed to SimpleAggregateFunction or to the underlying type. So they are interchangeable.

{{% alert title="Info" color="info" %}}
`-SimpleState` is useful for implicit Materialized View creation, like
`CREATE MATERIALIZED VIEW mv
ENGINE = AggregatingMergeTree
ORDER BY date AS
SELECT
    date,
    sumSimpleState(1) AS cnt,
    sumSimpleState(revenue) AS rev
FROM table
GROUP BY date`
{{% /alert %}}

{{% alert title="Warning" color="warning" %}}
`-SimpleState` supported since 21.1.
See [https://github.com/ClickHouse/ClickHouse/pull/16853/](https://github.com/ClickHouse/ClickHouse/pull/16853/commits/5b1e5679b4a292e33ee5e60c0ba9cefa1e8388bd)
{{% /alert %}}

### Q. Can I use -If combinator with SimpleAggregateFunction?

Something like `SimpleAggregateFunction(maxIf, UInt64, UInt8)` is NOT possible. But is 100% ok to push `maxIf` (or `maxSimpleStateIf`)  into `SimpleAggregateFunction(max, UInt64)`

There is one problem with that approach:
`-SimpleStateIf` Would produce 0 as result in case of no-match, and it can mess up some aggregate functions state. It wouldn't affect functions like `max/argMax/sum`, but could affect functions like `min/argMin/any/anyLast`

```sql
SELECT
    minIfMerge(state_1),
    min(state_2)
FROM
(
    SELECT
        minIfState(number, number > 5) AS state_1,
        minSimpleStateIf(number, number > 5) AS state_2
    FROM numbers(5)
    UNION ALL
    SELECT
        minIfState(toUInt64(2), 2),
        minIf(2, 2)
)

┌─minIfMerge(state_1)─┬─min(state_2)─┐
│                   2 │            0 │
└─────────────────────┴──────────────┘
```

You can easily workaround that:

1. Using Nullable datatype.
2. Set result to some big number in case of no-match, which would be bigger than any possible value, so it would be safe to use. But it would work only for `min/argMin`

```sql
SELECT
    min(state_1),
    min(state_2)
FROM
(
    SELECT
        minSimpleState(if(number > 5, number, 1000)) AS state_1,
        minSimpleStateIf(toNullable(number), number > 5) AS state_2
    FROM numbers(5)
    UNION ALL
    SELECT
        minIf(2, 2),
        minIf(2, 2)
)

┌─min(state_1)─┬─min(state_2)─┐
│            2 │            2 │
└──────────────┴──────────────┘
```

### Extra example

```sql
WITH
    minIfState(number, number > 5) AS state_1,
    minSimpleStateIf(number, number > 5) AS state_2
SELECT
    byteSize(state_1),
    toTypeName(state_1),
    byteSize(state_2),
    toTypeName(state_2)
FROM numbers(10)
FORMAT Vertical

-- For UInt64
Row 1:
──────
byteSize(state_1):   24
toTypeName(state_1): AggregateFunction(minIf, UInt64, UInt8)
byteSize(state_2):   8
toTypeName(state_2): SimpleAggregateFunction(min, UInt64)

-- For UInt32
──────
byteSize(state_1):   16
byteSize(state_2):   4

-- For UInt16
──────
byteSize(state_1):   12
byteSize(state_2):   2

-- For UInt8
──────
byteSize(state_1):   10
byteSize(state_2):   1
```

See also https://gist.github.com/filimonov/a4f6754497f02fcef78e9f23a4d170ee
