---
title: "ClickHouse® python drivers"
linkTitle: "ClickHouse® python drivers"
weight: 100
description: >-
     Python main drivers/clients for ClickHouse®
---

There are two main python drivers that can be used with ClickHouse®. They all have their different set of features and use cases:

## ClickHouse driver AKA [clickhouse-driver](https://clickhouse-driver.readthedocs.io/en/latest/)

The **`clickhouse-driver`** is a Python library used for interacting with ClickHouse. Here's a summary of its features:

1. **Connectivity**: **`clickhouse-driver`** allows Python applications to connect to ClickHouse servers over TCP/IP Native Interface (9000/9440 ports) and also HTTP interface but it is experimental.
2. **SQL Queries**: It enables executing SQL queries against ClickHouse databases from Python scripts, including data manipulation (insertion, deletion, updating) and data retrieval (select queries).
3. **Query Parameters**: Supports parameterized queries, which helps in preventing SQL injection attacks and allows for more efficient execution of repeated queries with different parameter values.
4. **Connection Pooling**: Provides support for connection pooling, which helps manage connections efficiently, especially in high-concurrency applications, by reusing existing connections instead of creating new ones for each query.
5. **Data Types**: Handles conversion between Python data types and ClickHouse data types, ensuring compatibility and consistency when passing data between Python and ClickHouse.
6. **Error Handling**: Offers comprehensive error handling mechanisms, including exceptions and error codes, to facilitate graceful error recovery and handling in Python applications.
7. **Asynchronous Support**: Supports asynchronous execution of queries using `asyncio`, allowing for non-blocking query execution in asynchronous Python applications.
8. **Customization**: Provides options for customizing connection settings, query execution behavior, and other parameters to suit specific application requirements and performance considerations.
9. **Compatibility**: Works with various versions of ClickHouse, ensuring compatibility and support for different ClickHouse features and functionalities.
10. **Documentation and Community**: Offers comprehensive documentation and active community support, including examples, tutorials, and forums, to assist developers in effectively using the library and addressing any issues or questions they may have. 

**Python ecosystem libs/modules:**

- Good Pandas/Numpy support: [https://clickhouse-driver.readthedocs.io/en/latest/features.html#numpy-pandas-support](https://clickhouse-driver.readthedocs.io/en/latest/features.html#numpy-pandas-support)
- Good SQLALchemy support: [https://pypi.org/project/clickhouse-sqlalchemy/](https://pypi.org/project/clickhouse-sqlalchemy/)

This was the first python driver for ClickHouse. It has a mature codebase. By default ClickHouse drivers uses [synchronous code](https://clickhouse-driver.readthedocs.io/en/latest/quickstart.html#async-and-multithreading). There is a wrapper to convert code to asynchronous, [https://github.com/long2ice/asynch](https://github.com/long2ice/asynch)

Here you can get a basic working example from Altinity repo for ingestion/selection using clickhouse-driver:

[https://github.com/lesandie/clickhouse-tests/blob/main/scripts/test_ch_driver.py](https://github.com/lesandie/clickhouse-tests/blob/main/scripts/test_ch_driver.py)

## ClickHouse-connect AKA [clickhouse-connect](https://clickhouse.com/docs/en/integrations/python)

The ClickHouse Connect Python driver is the ClickHouse, Inc. supported-official Python library. Here's a summary of its key features:

1. **Connectivity**: allows Python applications to connect to ClickHouse servers over HTTP Interface (8123/8443 ports).
2. **Compatibility**: The driver is compatible with Python 3.x versions, ensuring that it can be used with modern Python applications without compatibility issues.
3. **Performance**: The driver is optimized for performance, allowing for efficient communication with ClickHouse databases to execute queries and retrieve results quickly, which is crucial for applications requiring low latency and high throughput.
4. **Query Execution**: Developers can use the driver to execute SQL queries against ClickHouse databases, including SELECT, INSERT, UPDATE, DELETE, and other SQL operations, enabling them to perform various data manipulation tasks from Python applications.
5. **Parameterized Queries**: The driver supports parameterized queries, allowing developers to safely pass parameters to SQL queries to prevent SQL injection attacks and improve query performance by reusing query execution plans.
6. **Data Type Conversion**: The driver automatically handles data type conversion between Python data types and ClickHouse data types, ensuring seamless integration between Python applications and ClickHouse databases without manual data type conversion.
7. **Error Handling**: The driver provides robust error handling mechanisms, including exceptions and error codes, to help developers handle errors gracefully and take appropriate actions based on the type of error encountered during query execution.
8. **Limited Asynchronous Support**: Some implementations of the driver offer asynchronous support, allowing developers to execute queries asynchronously to improve concurrency and scalability in asynchronous Python applications using asynchronous I/O frameworks like `asyncio`. 
9. **Configuration Options**: The driver offers various configuration options, such as connection parameters, authentication methods, and connection pooling settings, allowing developers to customize the driver's behavior to suit their specific requirements and environment.
10. **Documentation and Community**: Offers comprehensive documentation and active community support, including examples, tutorials, and forums, to assist developers in effectively using the library and addressing any issues or questions they may have.  [https://clickhouse.com/docs/en/integrations/language-clients/python/intro/](https://clickhouse.com/docs/en/integrations/language-clients/python/intro/)

**Python ecosystem libs/modules:**

- Good Pandas/Numpy support: [https://clickhouse.com/docs/en/integrations/python#consuming-query-results-with-numpy-pandas-or-arrow](https://clickhouse.com/docs/en/integrations/python#consuming-query-results-with-numpy-pandas-or-arrow)
- Decent SQLAlchemy 1.3 and 1.4 support (limited feature set)

It is the most recent driver with the latest feature set (query context and query streaming …. )

You can check multiple official examples here: 

[https://github.com/ClickHouse/clickhouse-connect/tree/457533df05fa685b2a1424359bea5654240ef971/examples](https://github.com/ClickHouse/clickhouse-connect/tree/457533df05fa685b2a1424359bea5654240ef971/examples)

Also some Altinity examples from repo:

[https://github.com/lesandie/clickhouse-tests/blob/main/scripts/test_ch_connect_asyncio_insert.py](https://github.com/lesandie/clickhouse-tests/blob/main/scripts/test_ch_connect_asyncio_insert.py)

You can clone the repo and use the helper files like `DDL.sql`  to setup some tests.

`clickhouse-connect` can use a connection pooler (based on urllib3) [https://clickhouse.com/docs/en/integrations/python#customizing-the-http-connection-pool](https://clickhouse.com/docs/en/integrations/python#customizing-the-http-connection-pool)

### Most common use cases:

#### Managing ClickHouse `session_id`:

- `clickhouse-driver`
    - Because it is using the Native Interface `session_id` is managed internally by clickhouse, so it is very rare (unless using asyncio) to get:
    
    `Code: 373. DB::Exception: Session is locked by a concurrent client. (SESSION_IS_LOCKED)` . 
    

- `clickhouse-connect`: How to use `clickhouse-connect` in a pythonic way and avoid getting `SESSION_IS_LOCKED`  exceptions:
    - [https://clickhouse.com/docs/en/integrations/python#managing-clickhouse-session-ids](https://clickhouse.com/docs/en/integrations/python#managing-clickhouse-session-ids)
    - If you want to specify a session_id per query you should be able to use the setting dictionary to pass a `session_id` for each query (note that ClickHouse will automatically generate a `session_id` if none is provided).
    
    ```python
    SETTINGS = {"session_id": "dagster-batch" + "-" + f"{time.time()}"}
    client.query("INSERT INTO table ....", settings=SETTINGS)
    ```
    

Also in ClickHouse documentation some explanation how to set `session_id` with another approach: [https://clickhouse.com/docs/en/integrations/python#managing-clickhouse-session-ids](https://clickhouse.com/docs/en/integrations/python#managing-clickhouse-session-ids)

[ClickHouse Connect Driver API | ClickHouse Docs](https://clickhouse.com/docs/en/integrations/language-clients/python/driver-api#common-method-arguments)

[Best practices with flask · Issue #73 · ClickHouse/clickhouse-connect](https://github.com/ClickHouse/clickhouse-connect/issues/73#issuecomment-1325280242)

#### `clickhouse-connect` & `clickhouse-driver` with Asyncio

`clickhouse-connect` code is synchronous and running synchronous functions in an async application is a workaround and might not be as efficient as using a library designed for asynchronous operations from the ground up. Problem is there are few libs/modules in Python. So you can use `concurrent.futures` and `ThreadpoolExecutor` or `ProcessPoolExecutor`. Python GIL has a mutex over Threads but not to Processes so if you need performance at the cost of using processes instead of threads (not much different for medium workloads) you can use `ProcesspoolExecutor` instead.

Some info about this from the tinybird guys [https://www.tinybird.co/blog-posts/killing-the-processpoolexecutor](https://www.tinybird.co/blog-posts/killing-the-processpoolexecutor)

For `clickhouse-connect`

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor
import clickhouse_connect

# Function to execute a query using clickhouse-connect synchronously
def execute_query_sync(query):
    client = clickhouse_connect.get_client()  # Adjust connection params as needed
    result = client.query(query)
    return result

# Asynchronous wrapper function to run the synchronous function in a thread pool
async def execute_query_async(query):
    loop = asyncio.get_running_loop()
    # Use ThreadPoolExecutor to execute the synchronous function
    with ThreadPoolExecutor() as pool:
        result = await loop.run_in_executor(pool, execute_query_sync, query)
        return result

async def main():
    query = "SELECT * FROM your_table LIMIT 10"  # Example query
    result = await execute_query_async(query)
    print(result)

# Run the async main function
if __name__ == '__main__':
    asyncio.run(main())
```

`clickhouse-driver code is also synchronous and suffers the same problem as `clickhouse-connect`

[https://clickhouse-driver.readthedocs.io/en/latest/quickstart.html#async-and-multithreading](https://clickhouse-driver.readthedocs.io/en/latest/quickstart.html#async-and-multithreading)

So to use an asynchronous approach it is recommended to use a connection pool and some `asyncio` wrapper that can hide the complexity of using the `ThreadPoolExecutor/ProcessPoolExecutor`

To begin testing such environment [aiohttp](https://docs.aiohttp.org/) is a good approach. Here an example:

[https://github.com/lesandie/clickhouse-tests/blob/main/scripts/test_aiohttp_inserts.py](https://github.com/lesandie/clickhouse-tests/blob/main/scripts/test_aiohttp_inserts.py)

How to tune the connection pooler: [https://docs.aiohttp.org/en/stable/client_advanced.html#limiting-connection-pool-size](https://docs.aiohttp.org/en/stable/client_advanced.html#limiting-connection-pool-size))

Also `aiochclient` is another good wrapper  [https://github.com/maximdanilchenko/aiochclient](https://github.com/maximdanilchenko/aiochclient) for the HTTP interface

For the native interface you can try [https://github.com/long2ice/asynch](https://github.com/long2ice/asynch)

`asynch` is an asyncio ClickHouse Python Driver with native (TCP) interface support, which reuses most of [clickhouse-driver](https://github.com/mymarilyn/clickhouse-driver) and complies with [PEP249](https://www.python.org/dev/peps/pep-0249/).