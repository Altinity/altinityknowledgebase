---
title: "Data types on disk and in RAM"
linkTitle: "Data types on disk and in RAM"
description: >
    Data types on disk and in RAM
---
<table>
  <thead>
    <tr>
      <th style="text-align:left">DataType</th>
      <th style="text-align:left">RAM size (=byteSize)</th>
      <th style="text-align:left">Disk Size</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="text-align:left">String</td>
      <td style="text-align:left">
        <p>string byte length + 9
          <br />
        </p>
        <p>string length: 64 bit integer</p>
        <p>zero-byte terminator: 1 byte.</p>
      </td>
      <td style="text-align:left">
        <p>string length prefix (varint) + string itself:</p>
        <p>
          <br />string shorter than 128 - string byte length + 1
          <br />string shorter than 16384 - string byte length + 2
          <br />string shorter than 2097152 - string byte length + 2
          <br />string shorter than 268435456 - string byte length + 4</p>
      </td>
    </tr>
    <tr>
      <td style="text-align:left">AggregateFunction(count, ...)</td>
      <td style="text-align:left"></td>
      <td style="text-align:left">varint</td>
    </tr>
  </tbody>
</table>

See also [https://github.com/ClickHouse/clickhouse-presentations/blob/master/meetup41/data_processing.pdf](https://github.com/ClickHouse/clickhouse-presentations/blob/master/meetup41/data_processing.pdf) (slide 17-22)
