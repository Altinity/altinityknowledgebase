---
title: "Config by provider"
description: >
    Kafka engine configuration examples grouped by managed Kafka provider.
weight: 15
---

Sometimes the consumer group needs to be explicitly allowed in the broker UI config.

Read [Adjusting librdkafka settings](./altinity-kb-adjusting-librdkafka-settings/) first, then apply the provider-specific settings below.

### Amazon MSK | SASL/SCRAM

```xml
<yandex>
  <kafka>
    <security_protocol>sasl_ssl</security_protocol>
    <!-- Depending on your broker config you may need to uncomment below sasl_mechanism -->
    <!-- <sasl_mechanism>SCRAM-SHA-512</sasl_mechanism> -->
    <sasl_username>root</sasl_username>
    <sasl_password>toor</sasl_password>
  </kafka>
</yandex>
```
- [Broker ports detail](https://docs.aws.amazon.com/msk/latest/developerguide/port-info.html)
- [Read here more](https://leftjoin.ru/blog/data-engineering/clickhouse-as-a-consumer-to-amazon-msk/) (Russian language)


### on-prem / self-hosted Kafka broker

```xml
<yandex>
  <kafka>
    <security_protocol>sasl_ssl</security_protocol>
    <sasl_mechanism>SCRAM-SHA-512</sasl_mechanism>
    <sasl_username>root</sasl_username>
    <sasl_password>toor</sasl_password>
    <!-- fullchain cert here -->
    <ssl_ca_location>/path/to/cert/fullchain.pem</ssl_ca_location>
  </kafka>
</yandex>
```


### Inline Kafka certs

To connect to some Kafka cloud services you may need to use certificates.

If needed they can be converted to pem format and inlined into ClickHouse® config.xml
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

See

- [https://help.aiven.io/en/articles/489572-getting-started-with-aiven-kafka](https://help.aiven.io/en/articles/489572-getting-started-with-aiven-kafka)

- [https://stackoverflow.com/questions/991758/how-to-get-pem-file-from-key-and-crt-files](https://stackoverflow.com/questions/991758/how-to-get-pem-file-from-key-and-crt-files)

### Azure Event Hub

See [https://github.com/ClickHouse/ClickHouse/issues/12609](https://github.com/ClickHouse/ClickHouse/issues/12609)

### Confluent Cloud / Google Cloud

```xml
<yandex>
  <kafka>
    <auto_offset_reset>smallest</auto_offset_reset>
    <security_protocol>SASL_SSL</security_protocol>
    <!-- older broker versions may need this below, for newer versions ignore -->
    <!-- <ssl_endpoint_identification_algorithm>https</ssl_endpoint_identification_algorithm> -->
    <sasl_mechanism>PLAIN</sasl_mechanism>
    <sasl_username>username</sasl_username>
    <sasl_password>password</sasl_password>
    <!-- Same as above here ignore if newer broker version -->
    <!-- <ssl_ca_location>probe</ssl_ca_location> -->
  </kafka>
</yandex>
```
- [https://docs.confluent.io/cloud/current/client-apps/config-client.html](https://docs.confluent.io/cloud/current/client-apps/config-client.html)
- [https://cloud.google.com/managed-service-for-apache-kafka/docs/authentication-kafka](https://cloud.google.com/managed-service-for-apache-kafka/docs/authentication-kafka)
