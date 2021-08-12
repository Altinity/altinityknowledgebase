---
title: "Floats vs Decimals"
linkTitle: "Floats vs Decimals"
description: >
    Floats vs Decimals
---
Float arithmetics is not accurate: [https://floating-point-gui.de/](https://floating-point-gui.de/)

In case you need accurate calculations you should use Decimal datatypes.

### Operations on floats are not associative

```text
select toFloat64(100000000000000000.1) + toFloat64(7.5) - toFloat64(100000000000000000.1) as res;
---
title: "0"
linkTitle: "0"
description: >
    0
---
select toFloat64(100000000000000000.1) - toFloat64(100000000000000000.1) + toFloat64(7.5) as res;
---
title: "7.5"
linkTitle: "7.5"
description: >
    7.5
---
---
title: "no problem with Decimals:"
linkTitle: "no problem with Decimals:"
description: >
    no problem with Decimals:
---
select toDecimal64(100000000000000000.1,1) + toDecimal64(7.5,1) - toDecimal64(100000000000000000.1,1) as res;
---
title: "7.5"
linkTitle: "7.5"
description: >
    7.5
---
select toDecimal64(100000000000000000.1,1) - toDecimal64(100000000000000000.1,1) + toDecimal64(7.5,1) as res;
---
title: "7.5"
linkTitle: "7.5"
description: >
    7.5
---
```

{{% alert title="Warning" color="warning" %}}
Because clickhouse uses MPP order of execution of a single query can vary on each run, and you can get slightly different results from the float column every time you run the query.

Usually, this deviation is small, but it can be significant when some kind of arithmetic operation is performed on very large and very small numbers at the same time.
{{% /alert %}}

### Some decimal numbers has no accurate float representation

```text
select sum(toFloat64(0.45)) from numbers(10000);
---
title: "4499.999999999948 "
linkTitle: "4499.999999999948 "
description: >
    4499.999999999948
---
select toFloat32(0.6)*6;
---
title: "3.6000001430511475"
linkTitle: "3.6000001430511475"
description: >
    3.6000001430511475
---
---
title: "no problem with Decimal"
linkTitle: "no problem with Decimal"
description: >
    no problem with Decimal
---
select sum(toDecimal64(0.45,2)) from numbers(10000);
---
title: "4500.00  "
linkTitle: "4500.00  "
description: >
    4500.00
---
select toDecimal32(0.6,1)*6;
---
title: "3.6"
linkTitle: "3.6"
description: >
    3.6
---
```

### Direct comparisons of floats may be impossible

The same number can have several floating-point representations and because of that you should not compare Floats directly

```text
select toFloat32(0.1)*10 = toFloat32(0.01)*100;
---
title: "0"
linkTitle: "0"
description: >
    0
---
SELECT
    sumIf(0.1, number < 10) AS a,
    sumIf(0.01, number < 100) AS b,
    a = b AS a_eq_b
FROM numbers(100)

Row 1:
──────
a:      0.9999999999999999
b:      1.0000000000000007
a_eq_b: 0
```

See also

[https://randomascii.wordpress.com/2012/02/25/comparing-floating-point-numbers-2012-edition/](https://randomascii.wordpress.com/2012/02/25/comparing-floating-point-numbers-2012-edition/)
[https://stackoverflow.com/questions/4915462/how-should-i-do-floating-point-comparison](https://stackoverflow.com/questions/4915462/how-should-i-do-floating-point-comparison)
[https://stackoverflow.com/questions/2100490/floating-point-inaccuracy-examples](https://stackoverflow.com/questions/2100490/floating-point-inaccuracy-examples)
[https://stackoverflow.com/questions/10371857/is-floating-point-addition-and-multiplication-associative](https://stackoverflow.com/questions/10371857/is-floating-point-addition-and-multiplication-associative)

But:

[https://github.com/ClickHouse/ClickHouse/issues/24909](https://github.com/ClickHouse/ClickHouse/issues/24909)
