---
title: "Parameterized views"
linkTitle: "Parameterized views"
description: >
    Parameterized views
---
Custom settings allows to emulate parameterized views.

You need to enable custom settings and define any prefixes for settings.

```markup
$ cat /etc/clickhouse-server/config.d/custom_settings_prefixes.xml
<?xml version="1.0" ?>
<yandex>
    <custom_settings_prefixes>my,my2</custom_settings_prefixes>
</yandex>
```

You can also set the default value for user settings in the default section of the user configuration.
```markup
$ cat /etc/clickhouse-server/users.xml
<?xml version="1.0"?>
<yandex>
    <!-- Profiles of settings. -->
    <profiles>
        <!-- Default settings. -->
        <default>
            <my2_category>'hot deals'</my2_category>
            ...
```
A server restart is required for the default value to be applied
```markup
$ service clickhouse-server restart
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
