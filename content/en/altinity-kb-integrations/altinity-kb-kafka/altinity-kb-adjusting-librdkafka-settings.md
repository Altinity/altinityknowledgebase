---
title: "Adjusting librdkafka settings"
linkTitle: "Adjusting librdkafka settings"
description: >
    Adjusting librdkafka settings
---
* To set rdkafka options - add to `<kafka>` section in `config.xml` or preferably use a separate file in `config.d/`:
  * [https://github.com/edenhill/librdkafka/blob/master/CONFIGURATION.md](https://github.com/edenhill/librdkafka/blob/master/CONFIGURATION.md)

Some random example:

```xml
<yandex>
    <kafka>
        <max_poll_interval_ms>60000</max_poll_interval_ms>
        <session_timeout_ms>60000</session_timeout_ms>
        <heartbeat_interval_ms>10000</heartbeat_interval_ms>
        <reconnect_backoff_ms>5000</reconnect_backoff_ms>
        <reconnect_backoff_max_ms>60000</reconnect_backoff_max_ms>
        <request_timeout_ms>20000</request_timeout_ms>
        <retry_backoff_ms>500</retry_backoff_ms>
        <message_max_bytes>20971520</message_max_bytes>
        <debug>all</debug><!-- only to get the errors -->
        <security_protocol>SSL</security_protocol>
        <ssl_ca_location>/etc/clickhouse-server/ssl/kafka-ca-qa.crt</ssl_ca_location>
        <ssl_certificate_location>/etc/clickhouse-server/ssl/client_clickhouse_client.pem</ssl_certificate_location>
        <ssl_key_location>/etc/clickhouse-server/ssl/client_clickhouse_client.key</ssl_key_location>
        <ssl_key_password>pass</ssl_key_password>
    </kafka>
</yandex>
```

## Authentication / connectivity

### Amazon MSK

```xml
<yandex>
  <kafka>
    <security_protocol>sasl_ssl</security_protocol>
    <sasl_username>root</sasl_username>
    <sasl_password>toor</sasl_password>
  </kafka>
</yandex>
```

### SASL/SCRAM

```xml
<yandex>
  <kafka>
    <security_protocol>sasl_ssl</security_protocol>
    <sasl_mechanism>SCRAM-SHA-512</sasl_mechanism>
    <sasl_username>root</sasl_username>
    <sasl_password>toor</sasl_password>
  </kafka>
</yandex>
```

[https://leftjoin.ru/all/clickhouse-as-a-consumer-to-amazon-msk/](https://leftjoin.ru/all/clickhouse-as-a-consumer-to-amazon-msk/)

### Inline Kafka certs

To connect to some Kafka cloud services you may need to use certificates.

If needed they can be converted to pem format and inlined into ClickHouse config.xml
Example:

```xml
<kafka>
<ssl_key_pem><![CDATA[
  RSA Private-Key: (3072 bit, 2 primes)
    ....
-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----
]]></ssl_key_pem>
<ssl_certificate_pem><![CDATA[
-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
]]></ssl_certificate_pem>
</kafka>
```

See xml

[https://help.aiven.io/en/articles/489572-getting-started-with-aiven-kafka](https://help.aiven.io/en/articles/489572-getting-started-with-aiven-kafka)

[https://stackoverflow.com/questions/991758/how-to-get-pem-file-from-key-and-crt-files](https://stackoverflow.com/questions/991758/how-to-get-pem-file-from-key-and-crt-files)

### Azure Event Hub

See [https://github.com/ClickHouse/ClickHouse/issues/12609](https://github.com/ClickHouse/ClickHouse/issues/12609)

### Kerberos

* [https://clickhouse.tech/docs/en/engines/table-engines/integrations/kafka/\#kafka-kerberos-support](https://clickhouse.tech/docs/en/engines/table-engines/integrations/kafka/#kafka-kerberos-support)
* [https://github.com/ClickHouse/ClickHouse/blob/master/tests/integration/test_storage_kerberized_kafka/configs/kafka.xml](https://github.com/ClickHouse/ClickHouse/blob/master/tests/integration/test_storage_kerberized_kafka/configs/kafka.xml)

```xml
  <!-- Kerberos-aware Kafka -->
  <kafka>
    <security_protocol>SASL_PLAINTEXT</security_protocol>
    <sasl_kerberos_keytab>/home/kafkauser/kafkauser.keytab</sasl_kerberos_keytab>
    <sasl_kerberos_principal>kafkauser/kafkahost@EXAMPLE.COM</sasl_kerberos_principal>
  </kafka>
```

### confluent cloud

```xml
<yandex>
  <kafka>
    <auto_offset_reset>smallest</auto_offset_reset>
    <security_protocol>SASL_SSL</security_protocol>
    <ssl_endpoint_identification_algorithm>https</ssl_endpoint_identification_algorithm>
    <sasl_mechanism>PLAIN</sasl_mechanism>
    <sasl_username>username</sasl_username>
    <sasl_password>password</sasl_password>
    <ssl_ca_location>probe</ssl_ca_location>
    <!--
    <ssl_ca_location>/path/to/cert.pem</ssl_ca_location>      
    -->
  </kafka>
</yandex>
```

[https://docs.confluent.io/cloud/current/client-apps/config-client.html](https://docs.confluent.io/cloud/current/client-apps/config-client.html)

## How to test connection settings

Use kafkacat utility - it internally uses same library to access Kafla as clickhouse itself and allows easily to test different settings.

```bash
kafkacat -b my_broker:9092 -C -o -10 -t my_topic \
   -X security.protocol=SASL_SSL  \
   -X sasl.mechanisms=PLAIN \
   -X sasl.username=uerName \
   -X sasl.password=Password

```

# Different configurations for different tables?

> Is there some more documentation how to use this multiconfiguration for Kafka ?

The whole logic is here:
https://github.com/ClickHouse/ClickHouse/blob/da4856a2be035260708fe2ba3ffb9e437d9b7fef/src/Storages/Kafka/StorageKafka.cpp#L466-L475
 
So it load the main config first, after that it load (with overwrites) the configs for all topics,  **listed in `kafka_topic_list` of the table**.  
 
Also since v21.12 it's possible to use more straght-forward way using named_collections:
https://github.com/ClickHouse/ClickHouse/pull/31691
 
So you can say something like
 
```sql
CREATE TABLE test.kafka (key UInt64, value UInt64) ENGINE = Kafka(kafka1, kafka_format='CSV');
```
 
And after that in configuration:
 
```xml
<clickhouse>
 <named_collections>
  <kafka1>
   <kafka_broker_list>kafka1:19092</kafka_broker_list>
   <kafka_topic_list>conf</kafka_topic_list>
   <kafka_group_name>conf</kafka_group_name>
  </kafka1>
 </named_collections>
</clickhouse>


<yandex>
    <named_collections>
        <kafka_preset1>
            <kafka_broker_list>...</kafka_broker_list>
            <kafka_topic_list>foo.bar</kafka_topic_list>
            <kafka_group_name>foo.bar.group</kafka_group_name>
            <kafka>
                <security_protocol>...</security_protocol>
                <sasl_mechanism>...</sasl_mechanism>
                <sasl_username>...</sasl_username>
                <sasl_password>...</sasl_password>
                <auto_offset_reset>smallest</auto_offset_reset>
                <ssl_endpoint_identification_algorithm>https</ssl_endpoint_identification_algorithm>
                <ssl_ca_location>probe</ssl_ca_location>
            </kafka>
        </kafka_preset1>
    </named_collections>
</yandex>

```
 
The same fragment of code in newer versions:
https://github.com/ClickHouse/ClickHouse/blob/d19e24f530c30f002488bc136da78f5fb55aedab/src/Storages/Kafka/StorageKafka.cpp#L474-L496
