---
title: "JOINs optimization tricks"
linkTitle: "JOINs optimization tricks"
description: >
    JOINs
---

This article was made before addition of new JOIN algorithms, so all tests were done with default `hash` join.

# Data

For our exercise, we will use two tables from a well known TPS-DS benchmark: store_sales and customer. Table sizes are the following:

store_sales 	= 2 billion rows
customer 		= 12 millions rows

So there are 200 rows in store_sales table per each customer on average. Also 90% of customers made 1-10 purchases.

Schema example:

```sql
CREATE TABLE store_sales
(
	`ss_sold_time_sk` DateTime,
	`ss_sold_date_sk` Date,
	`ss_ship_date_sk` Date,
	`ss_item_sk` UInt32,
	`ss_customer_sk` UInt32,
	`ss_cdemo_sk` UInt32,
	`ss_hdemo_sk` UInt32,
	`ss_addr_sk` UInt32,
	`ss_store_sk` UInt32,
	`ss_promo_sk` UInt32,
	`ss_ticket_number` UInt32,
	`ss_quantity` UInt32,
	`ss_wholesale_cost` Float64,
	`ss_list_price` Float64,
	`ss_sales_price` Float64,
	`ss_ext_discount_amt` Float64,
	`ss_ext_sales_price` Float64,
	`ss_ext_wholesale_cost` Float64,
	`ss_ext_list_price` Float64,
	`ss_ext_tax` Float64,
	`ss_coupon_amt` Float64,
	`ss_net_paid` Float64,
	`ss_net_paid_inc_tax` Float64,
	`ss_net_profit` Float64
)
ENGINE = MergeTree
ORDER BY ss_ticket_number

CREATE TABLE customer
(
	`c_customer_sk` UInt32,
	`c_current_addr_sk` UInt32,
	`c_first_shipto_date_sk` Date,
	`c_first_sales_date_sk` Date,
	`c_salutation` String,
	`c_c_first_name` String,
	`c_last_name` String,
	`c_preferred_cust_flag` String,
	`c_birth_date` Date,
	`c_birth_country` String,
	`c_login` String,
	`c_email_address` String,
	`c_last_review_date` Date
)
ENGINE = MergeTree
ORDER BY c_customer_id
```

# Target query

```sql
SELECT
	sumIf(ss_sales_price, customer.c_first_name = 'James') AS sum_James,
	sumIf(ss_sales_price, customer.c_first_name = 'Lisa') AS sum_Lisa,
	sum(ss_sales_price) AS sum_total
FROM store_sales
INNER JOIN customer ON store_sales.ss_customer_sk = customer.c_customer_sk
```

## Baseline performance

```sql
SELECT
	sumIf(ss_sales_price, customer.c_first_name = 'James') AS sum_James,
	sumIf(ss_sales_price, customer.c_first_name = 'Lisa') AS sum_Lisa,
	sum(ss_sales_price) AS sum_total
FROM store_sales
INNER JOIN customer ON store_sales.ss_customer_sk = customer.c_customer_sk

0 rows in set. Elapsed: 188.384 sec. Processed 2.89 billion rows, 40.60 GB (15.37 million rows/s., 216.92 MB/s.)
```

## Manual pushdown of conditions

If we look at our query, we only care if sale belongs to customer named `James` or `Lisa` and dont care for rest of cases. We can use that.

Usually, ClickHouse is able to pushdown conditions, but not in that case, when conditions itself part of function expression, so you can manually help in those cases.

```sql
SELECT  
      sumIf(ss_sales_price, customer.c_first_name = 'James') as sum_James,
    	sumIf(ss_sales_price, customer.c_first_name = 'Lisa') as sum_Lisa,
    	sum(ss_sales_price) as sum_total
FROM store_sales LEFT JOIN (SELECT * FROM customer WHERE c_first_name = 'James' OR c_first_name = 'Lisa') as customer ON store_sales.ss_customer_sk = customer.c_customer_sk

1 row in set. Elapsed: 35.370 sec. Processed 2.89 billion rows, 40.60 GB (81.76 million rows/s., 1.15 GB/s.)
```


## Reduce right table row size

### Reduce attribute columns (push expression before JOIN step)

Our row from the right table consists of 2 fields: customer_sk and c_first_name.
First one is needed to JOIN by it, so it's not much we can do here, but we can transform a bit of the second column.

Again, let's look in how we use this column in main query:

customer.c_first_name = 'James'
customer.c_first_name = 'Lisa'

We calculate 2 simple conditions(which don't have any dependency on data from the left table) and nothing more.
It does mean that we can move this calculation to the right table, it will make 3 improvements!

1. Right table will be smaller -> smaller RAM usage -> better cache hits
2. We will calculate our conditions over a smaller data set. In the right table we have only 10 million rows and after joining because of the left table we have 2 billion rows -> 200 times improvement!
3. Our resulting table after JOIN will not have an expensive String column, only 1 byte UInt8 instead -> less copy of data in memory.

Let's do it:

There are several ways to rewrite that query, let's not bother with simple once and go straight to most optimized:

Put our 2 conditions in hand-made bitmask:

In order to do that we will take our conditions and multiply them by

```
(c_first_name = 'James') + (2 * (c_first_name = 'Lisa')

C_first_name	| (c_first_name = 'James') + (2 * (c_first_name = 'Lisa')
   James        |         				00000001
   Lisa        	|         				00000010
```

As you can see, if you do it in that way, your conditions will not interfere with each other!
But we need to be careful with the wideness of the resulting numeric type.
Let's write our calculations in type notation:
`UInt8 + UInt8*2 ->  UInt8 + UInt16 -> UInt32`

But we actually do not use more than first 2 bits, so we need to cast this expression back to UInt8

Last thing to do is use the bitTest function in order to get the result of our condition by its position.

And resulting query is:

```sql
SELECT
	sumIf(ss_sales_price, bitTest(customer.cond, 0)) AS sum_James,
	sumIf(ss_sales_price, bitTest(customer.cond, 1)) AS sum_Lisa,
	sum(ss_sales_price) AS sum_total
FROM store_sales
LEFT JOIN
(
	SELECT
    	c_customer_sk,
    	((c_first_name = 'James') + (2 * (c_first_name = 'Lisa')))::UInt8 AS cond 	FROM customer
	WHERE (c_first_name = 'James') OR (c_first_name = 'Lisa')
) AS customer ON store_sales.ss_customer_sk = customer.c_customer_sk

1 row in set. Elapsed: 31.699 sec. Processed 2.89 billion rows, 40.60 GB (91.23 million rows/s., 1.28 GB/s.)
```

### Reduce key column size

But can we make something with our JOIN key column?

It's type is Nullable(UInt64)

Let's check if we really need to have a 0…18446744073709551615 range for our customer id, it sure looks like that we have much less people on earth than this number. The same about Nullable trait, we don’t care about Nulls in customer_id

SELECT max(c_customer_sk) FROM customer

For sure, we don't need that wide type.
Lets remove Nullable trait and cast column to UInt32, twice smaller in byte size compared to UInt64.

```sql
SELECT
	sumIf(ss_sales_price, bitTest(customer.cond, 0)) AS sum_James,
	sumIf(ss_sales_price, bitTest(customer.cond, 1)) AS sum_Lisa,
	sum(ss_sales_price) AS sum_total
FROM store_sales
LEFT JOIN
(
	SELECT
    	CAST(c_customer_sk, 'UInt32') AS c_customer_sk,
    	(c_first_name = 'James') + (2 * (c_first_name = 'Lisa')) AS cond
	FROM customer
	WHERE (c_first_name = 'James') OR (c_first_name = 'Lisa')
) AS customer ON store_sales.ss_customer_sk_nn = customer.c_customer_sk

1 row in set. Elapsed: 27.093 sec. Processed 2.89 billion rows, 26.20 GB (106.74 million rows/s., 967.16 MB/s.)
```

Another 10% perf improvement from using UInt32 key instead of Nullable(Int64)
Looks pretty neat, we almost got 10 times improvement over our initial query.
Can we do better?

Probably, but it does mean that we need to get rid of JOIN.

## Use IN clause instead of JOIN

Despite that all DBMS support ~ similar feature set, feature performance on different database are different:

Small example, for PostgreSQL, is recommended to replace big IN clauses with JOINs, because IN clauses have bad performance in it.
But for ClickHouse it's the opposite!, IN works faster than JOIN, because it only checks key existence in HashSet and doesn't need to extract any data from the right table in IN.

Let's test that:

```sql
SELECT
	sumIf(ss_sales_price, ss_customer_sk IN (
    	SELECT c_customer_sk
    	FROM customer
    	WHERE c_first_name = 'James'
	)) AS sum_James,
	sumIf(ss_sales_price, ss_customer_sk IN (
    	SELECT c_customer_sk
    	FROM customer
    	WHERE c_first_name = 'Lisa'
	)) AS sum_Lisa,
	sum(ss_sales_price) AS sum_total
FROM store_sales

1 row in set. Elapsed: 16.546 sec. Processed 2.90 billion rows, 40.89 GB (175.52 million rows/s., 2.47 GB/s.)
```

Almost 2 times faster than our previous record with JOIN, what if we will improve the same hint with c_customer_sk key like in JOIN?

```sql
SELECT
	sumIf(ss_sales_price, ss_customer_sk_nn IN (
    	SELECT c_customer_sk::UInt32
    	FROM customer
    	WHERE c_first_name = 'James'
	)) AS sum_James,
	sumIf(ss_sales_price, ss_customer_sk_nn IN (
    	SELECT c_customer_sk::UInt32
    	FROM customer
    	WHERE c_first_name = 'Lisa'
	)) AS sum_Lisa,
	sum(ss_sales_price) AS sum_total
FROM store_sales

1 row in set. Elapsed: 12.355 sec. Processed 2.90 billion rows, 26.49 GB (235.06 million rows/s., 2.14 GB/s.)
```

Another 25% performance!

But, there is one big limitation with IN approach, what if we have more than just 2 conditions? 

```sql
SELECT
	sumIf(ss_sales_price, ss_customer_sk_nn IN (
    	SELECT c_customer_sk::UInt32
    	FROM customer
    	WHERE c_first_name = 'James'
	)) AS sum_James,
	sumIf(ss_sales_price, ss_customer_sk_nn IN (
    	SELECT c_customer_sk::UInt32
    	FROM customer
    	WHERE c_first_name = 'Lisa'
	)) AS sum_Lisa,
	sumIf(ss_sales_price, ss_customer_sk_nn IN (
    	SELECT c_customer_sk::UInt32
    	FROM customer
    	WHERE c_last_name = 'Smith'
	)) AS sum_Smith,
	sumIf(ss_sales_price, ss_customer_sk_nn IN (
    	SELECT c_customer_sk::UInt32
    	FROM customer
    	WHERE c_last_name = 'Williams'
	)) AS sum_Williams,
	sum(ss_sales_price) AS sum_total
FROM store_sales

1 row in set. Elapsed: 23.690 sec. Processed 2.93 billion rows, 27.06 GB (123.60 million rows/s., 1.14 GB/s.)
```

## Adhoc alternative to Dictionary with FLAT layout

But first is a short introduction. What the hell is a Dictionary with a FLAT layout?

Basically, it's just a set of Array's for each attribute where the value position in the attribute array is just a dictionary key
For sure it put heavy limitation about what dictionary key could be, but it gives really good advantages:

`['Alice','James', 'Robert','John', ...].length = 12mil, Memory usage ~ N*sum(sizeOf(String(N)) + 1)`

It's really small memory usage (good cache hit rate) & really fast key lookups (no complex hash calculation)

So, if it's that great what are the caveats?
First one is that your keys should be ideally autoincremental (with small number of gaps)
And for second, lets look in that simple query and write down all calculations:

```sql
SELECT sumIf(ss_sales_price, dictGet(...) = 'James')
```

1. Dictionary call  		(2 billion times)
2. String equality check  	(2 billion times)

Although it's really efficient in terms of dictGet call and memory usage by Dictionary, it still materializes the String column (memcpy) and we pay a penalty of execution condition on top of such a string column for each row.

But what if we could first calculate our required condition and create such a "Dictionary" ad hoc in query time?

And we can actually do that!
But let's repeat our analysis again:

```sql
SELECT sumIf(ss_sales_price, here_lives_unicorns(dictGet(...) = 'James'))
```

`['Alice','James', 'Lisa','James', ...].map(x -> multiIf(x = 'James', 1, x = 'Lisa', 2, 0)) => [0,1,2,1,...].length` = 12mil, Memory usage ~ `N*sizeOf(UInt8)` <- It's event smaller than FLAT dictionary

And actions:

1. String equality check  	(12 million times)
2. Create Array     		(12 million elements)
3. Array call       		(2 billion times)
4. UInt8 equality check	(2 billion times)

But what is `here_lives_unicorns` function, does it exist in ClickHouse?

No, but we can hack it with some array manipulation:

```sql
SELECT sumIf(ss_sales_price, arr[customer_id] = 2)

WITH (
    	SELECT groupArray(assumeNotNull((c_first_name = 'James') + (2 * (c_first_name = 'Lisa')))::UInt8)
    	FROM
    	(
        	SELECT *
        	FROM customer
        	ORDER BY c_customer_sk ASC
    	)
	) AS cond
SELECT
	sumIf(ss_sales_price, bitTest(cond[ss_customer_sk], 0)) AS sum_James,
	sumIf(ss_sales_price, bitTest(cond[ss_customer_sk], 1)) AS sum_Lisa,
	sum(ss_sales_price) AS sum_total
FROM store_sales

1 row in set. Elapsed: 13.006 sec. Processed 2.89 billion rows, 40.60 GB (222.36 million rows/s., 3.12 GB/s.)

WITH (
    	SELECT groupArray(assumeNotNull((c_first_name = 'James') + (2 * (c_first_name = 'Lisa')))::UInt8)
    	FROM
    	(
        	SELECT *
        	FROM customer
        	ORDER BY c_customer_sk ASC
    	)
	) AS cond,
	bitTest(cond[ss_customer_sk_nn], 0) AS cond_james,
	bitTest(cond[ss_customer_sk_nn], 1) AS cond_lisa
SELECT
	sumIf(ss_sales_price, cond_james) AS sum_James,
	sumIf(ss_sales_price, cond_lisa) AS sum_Lisa,
	sum(ss_sales_price) AS sum_total
FROM store_sales


1 row in set. Elapsed: 10.054 sec. Processed 2.89 billion rows, 26.20 GB (287.64 million rows/s., 2.61 GB/s.)
```

20% faster than the IN approach, what if we will have not 2 but 4 such conditions:

```sql
WITH (
    	SELECT groupArray(assumeNotNull((((c_first_name = 'James') + (2 * (c_first_name = 'Lisa'))) + (4 * (c_last_name = 'Smith'))) + (8 * (c_last_name = 'Williams')))::UInt8)
    	FROM
    	(
        	SELECT *
        	FROM customer
        	ORDER BY c_customer_sk ASC
    	)
	) AS cond
SELECT
	sumIf(ss_sales_price, bitTest(cond[ss_customer_sk_nn], 0)) AS sum_James,
	sumIf(ss_sales_price, bitTest(cond[ss_customer_sk_nn], 1)) AS sum_Lisa,
	sumIf(ss_sales_price, bitTest(cond[ss_customer_sk_nn], 2)) AS sum_Smith,
	sumIf(ss_sales_price, bitTest(cond[ss_customer_sk_nn], 3)) AS sum_Williams,
	sum(ss_sales_price) AS sum_total
FROM store_sales

1 row in set. Elapsed: 11.454 sec. Processed 2.89 billion rows, 26.39 GB (252.49 million rows/s., 2.30 GB/s.)
```

As we can see, that Array approach doesn't even notice that we increased the amount of conditions by 2 times.
