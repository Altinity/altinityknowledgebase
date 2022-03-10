---
title: "Functions to count uniqs"
linkTitle: "Functions to count uniqs"
weight: 100
description: >-
     Functions to count uniqs.
---

## Functions to count uniqs

|Function|Function(State)|StateSize|Result|QPS|
|:-|:-|-:|-:|-:|
|uniqExact|uniqExactState|1600003|100000|59.23|
|uniq|uniqState|200804|100315|85.55|
|uniqCombined|uniqCombinedState|98505|100314|108.09|
|uniqCombined(12)|uniqCombinedState(12)|3291|98160|151.64|
|uniqCombined(15)|uniqCombinedState(15)|24783|100768|110.18|
|uniqCombined(18)|uniqCombinedState(18)|196805|100332|101.56|
|uniqCombined(20)|uniqCombinedState(20)|786621|100088|65.05|
|uniqCombined64(12)|uniqCombined64State(12)|3291|98160|164.96|
|uniqCombined64(15)|uniqCombined64State(15)|24783|100768|133.96|
|uniqCombined64(18)|uniqCombined64State(18)|196805|100332|110.85|
|uniqCombined64(20)|uniqCombined64State(20)|786621|100088|66.48|
|uniqHLL12|uniqHLL12State|2651|101344|177.91|
|uniqTheta|uniqThetaState|32795|98045|144.05|
|uniqUpTo(100)|uniqUpToState(100)|1|101|222.93|


Stats collected via script below on 22.2

```bash
funcname=( "uniqExact" "uniq" "uniqCombined" "uniqCombined(12)" "uniqCombined(15)" "uniqCombined(18)" "uniqCombined(20)" "uniqCombined64(12)" "uniqCombined64(15)" "uniqCombined64(18)" "uniqCombined64(20)" "uniqHLL12" "uniqTheta" "uniqUpTo(100)")
funcname2=( "uniqExactState" "uniqState" "uniqCombinedState" "uniqCombinedState(12)" "uniqCombinedState(15)" "uniqCombinedState(18)" "uniqCombinedState(20)" "uniqCombined64State(12)" "uniqCombined64State(15)" "uniqCombined64State(18)" "uniqCombined64State(20)" "uniqHLL12State" "uniqThetaState" "uniqUpToState(100)")

length=${#funcname[@]}
 

for (( j=0; j<length; j++ ));
do
  f1="${funcname[$j]}"
  f2="${funcname2[$j]}"
  size=$( clickhouse-client -q "select ${f2}(toString(number)) from numbers_mt(100000) FORMAT RowBinary" | wc -c )
  result="$( clickhouse-client -q "select ${f1}(toString(number)) from numbers_mt(100000)" )"
  time=$( rm /tmp/clickhouse-benchmark.json; echo "select ${f1}(toString(number)) from numbers_mt(100000)" | clickhouse-benchmark -i200 --json=/tmp/clickhouse-benchmark.json &>/dev/null; cat /tmp/clickhouse-benchmark.json | grep QPS  )

  printf "|%s|%s,%s,%s,%s\n" "$f1" "$f2" "$size" "$result" "$time"
done
```
