---
title: "Parameterized views"
linkTitle: "Parameterized views"
description: >
    Parameterized views
---

## ClickHouse® version 23.1+

(23.1.6.42, 23.2.5.46, 23.3.1.2823)
Have inbuild support for [parametrized views](https://clickhouse.com/docs/en/sql-reference/statements/create/view#parameterized-view):

```sql
CREATE VIEW my_new_view AS
SELECT *
FROM deals
WHERE category_id IN (
    SELECT category_id
    FROM deal_categories
    WHERE category = {category:String}
)

SELECT * FROM my_new_view(category = 'hot deals');
```
### One more example 

```sql
CREATE OR REPLACE VIEW v AS SELECT 1::UInt32 x WHERE x IN ({xx:Array(UInt32)});

select * from v(xx=[1,2,3]);
┌─x─┐
│ 1 │
└───┘
```


## ClickHouse versions pre 23.1

Custom settings allows to emulate parameterized views.

You need to enable custom settings and define any prefixes for settings.

```xml
$ cat /etc/clickhouse-server/config.d/custom_settings_prefixes.xml
<?xml version="1.0" ?>
<yandex>
    <custom_settings_prefixes>my,my2</custom_settings_prefixes>
</yandex>
```

You can also set the default value for user settings in the default section of the user configuration. 
```xml
cat /etc/clickhouse-server/users.d/custom_settings_default.xml
<?xml version="1.0"?>
<yandex>
    <profiles>
        <default>
            <my2_category>'hot deals'</my2_category>
        </default>
    </profiles>
</yandex>
```
See also: https://kb.altinity.com/altinity-kb-setup-and-maintenance/custom_settings/ 

A server restart is required for the default value to be applied
```bash
$ systemctl restart clickhouse-server
```

Now you can set settings as any other settings, and query them using **getSetting()** function.

```sql
SET my2_category='hot deals';

SELECT getSetting('my2_category');
┌─getSetting('my2_category')─┐
│ hot deals                  │
└────────────────────────────┘

-- you can query ClickHouse settings as well
SELECT getSetting('max_threads')
┌─getSetting('max_threads')─┐
│                         8 │
└───────────────────────────┘
```

Now we can create a view

```sql
CREATE VIEW my_new_view AS
SELECT *
FROM deals
WHERE category_id IN
(
    SELECT category_id
    FROM deal_categories
    WHERE category = getSetting('my2_category')
);
```

And query it

```sql
SELECT *
FROM my_new_view
SETTINGS my2_category = 'hot deals';
```

If the custom setting is not set when the view is being created, you need to explicitly define the list of columns for the view:

```sql
CREATE VIEW my_new_view (c1 Int, c2 String, ...)
AS
SELECT *
FROM deals
WHERE category_id IN
(
    SELECT category_id
    FROM deal_categories
    WHERE category = getSetting('my2_category')
);
```
