---
title: "Custom Settings"
linkTitle: "Custom Settings"
weight: 100
description: >-
     Using custom settings
---

## Using custom settings in config 

You can not use the custom settings in config file 'as is', because clickhouse don't know which datatype should be used to parse it.

```xml
cat /etc/clickhouse-server/users.d/default_profile.xml 
<?xml version="1.0"?>
<yandex>
    <profiles>
        <default>
     	     <custom_data_version>1</custom_data_version> <!-- will not work! see below -->
        </default>
    </profiles>
</yandex>
```

That will end up with the following error:

```
2021.09.24 12:50:37.369259 [ 264905 ] {} <Error> ConfigReloader: Error updating configuration from '/etc/clickhouse-server/users.xml' config.: Code: 536. DB::Exception: Couldn't restore Field from dump: 1: while parsing value '1' for setting 'custom_data_version'. (CANNOT_RESTORE_FROM_FIELD_DUMP), Stack trace (when copying this message, always include the lines below):

0. DB::Exception::Exception(std::__1::basic_string<char, std::__1::char_traits<char>, std::__1::allocator<char> > const&, int, bool) @ 0x9440eba in /usr/lib/debug/.build-id/ba/25f6646c3be7aa95f452ec85461e96178aa365.debug
1. DB::Field::restoreFromDump(std::__1::basic_string_view<char, std::__1::char_traits<char> > const&)::$_4::operator()() const @ 0x10449da0 in /usr/lib/debug/.build-id/ba/25f6646c3be7aa95f452ec85461e96178aa365.debug
2. DB::Field::restoreFromDump(std::__1::basic_string_view<char, std::__1::char_traits<char> > const&) @ 0x10449bf1 in /usr/lib/debug/.build-id/ba/25f6646c3be7aa95f452ec85461e96178aa365.debug
3. DB::BaseSettings<DB::SettingsTraits>::stringToValueUtil(std::__1::basic_string_view<char, std::__1::char_traits<char> > const&, std::__1::basic_string<char, std::__1::char_traits<char>, std::__1::allocator<char> > const&) @ 0x1042e2bf in /usr/lib/debug/.build-id/ba/25f6646c3be7aa95f452ec85461e96178aa365.debug
4. DB::UsersConfigAccessStorage::parseFromConfig(Poco::Util::AbstractConfiguration const&) @ 0x1041a097 in /usr/lib/debug/.build-id/ba/25f6646c3be7aa95f452ec85461e96178aa365.debug
5. void std::__1::__function::__policy_invoker<void (Poco::AutoPtr<Poco::Util::AbstractConfiguration>, bool)>::__call_impl<std::__1::__function::__default_alloc_func<DB::UsersConfigAccessStorage::load(std::__1::basic_string<char, std::__1::char_traits<char>, std::__1::allocator<char> > const&, std::__1::basic_string<char, std::__1::char_traits<char>, std::__1::allocator<char> > const&, std::__1::basic_string<char, std::__1::char_traits<char>, std::__1::allocator<char> > const&, std::__1::function<std::__1::shared_ptr<zkutil::ZooKeeper> ()> const&)::$_0, void (Poco::AutoPtr<Poco::Util::AbstractConfiguration>, bool)> >(std::__1::__function::__policy_storage const*, Poco::AutoPtr<Poco::Util::AbstractConfiguration>&&, bool) @ 0x1042e7ff in /usr/lib/debug/.build-id/ba/25f6646c3be7aa95f452ec85461e96178aa365.debug
6. DB::ConfigReloader::reloadIfNewer(bool, bool, bool, bool) @ 0x11caf54e in /usr/lib/debug/.build-id/ba/25f6646c3be7aa95f452ec85461e96178aa365.debug
7. DB::ConfigReloader::run() @ 0x11cb0f8f in /usr/lib/debug/.build-id/ba/25f6646c3be7aa95f452ec85461e96178aa365.debug
8. ThreadFromGlobalPool::ThreadFromGlobalPool<void (DB::ConfigReloader::*)(), DB::ConfigReloader*>(void (DB::ConfigReloader::*&&)(), DB::ConfigReloader*&&)::'lambda'()::operator()() @ 0x11cb19f1 in /usr/lib/debug/.build-id/ba/25f6646c3be7aa95f452ec85461e96178aa365.debug
9. ThreadPoolImpl<std::__1::thread>::worker(std::__1::__list_iterator<std::__1::thread, void*>) @ 0x9481f5f in /usr/lib/debug/.build-id/ba/25f6646c3be7aa95f452ec85461e96178aa365.debug
10. void* std::__1::__thread_proxy<std::__1::tuple<std::__1::unique_ptr<std::__1::__thread_struct, std::__1::default_delete<std::__1::__thread_struct> >, void ThreadPoolImpl<std::__1::thread>::scheduleImpl<void>(std::__1::function<void ()>, int, std::__1::optional<unsigned long>)::'lambda0'()> >(void*) @ 0x9485843 in /usr/lib/debug/.build-id/ba/25f6646c3be7aa95f452ec85461e96178aa365.debug
11. start_thread @ 0x9609 in /usr/lib/x86_64-linux-gnu/libpthread-2.31.so
12. __clone @ 0x122293 in /usr/lib/x86_64-linux-gnu/libc-2.31.so
 (version 21.10.1.8002 (official build))


2021.09.29 11:36:07.722213 [ 2090 ] {} <Error> Application: DB::Exception: Couldn't restore Field from dump: 1: while parsing value '1' for setting 'custom_data_version'
```

To make it work you need to change it an the following way:
```xml
cat /etc/clickhouse-server/users.d/default_profile.xml 
<?xml version="1.0"?>
<yandex>
    <profiles>
        <default>
            <custom_data_version>UInt64_1</custom_data_version>
        </default>
    </profiles>
</yandex>
```
or
```xml
cat /etc/clickhouse-server/users.d/default_profile.xml 
<?xml version="1.0"?>
<yandex>
    <profiles>
        <default>
            <custom_data_version>'1'</custom_data_version>
        </default>
    </profiles>
</yandex>
```

The list of recognized prefixes is in the sources: https://github.com/ClickHouse/ClickHouse/blob/ea13a8b562edbc422c07b5b4ecce353f79b6cb63/src/Core/Field.cpp#L253-L270
