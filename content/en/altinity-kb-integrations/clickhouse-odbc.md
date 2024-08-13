---
title: "ODBC Driver for ClickHouse®"
linkTitle: "ODBC Driver for ClickHouse®"
weight: 100
description: >-
      ODBC Driver for ClickHouse®
---

[ODBC](https://docs.microsoft.com/en-us/sql/odbc/reference/odbc-overview) interface for ClickHouse® RDBMS.

Licensed under the [Apache 2.0](https://github.com/ClickHouse/clickhouse-odbc?tab=Apache-2.0-1-ov-file#readme).

## Installation and usage

### Windows

1. Download the latest [release](https://github.com/ClickHouse/clickhouse-odbc/releases). On 64bit system you usually need both 32 bit and 64 bit drivers.
2. Install (usually you will need ANSI driver, but better to install both versions, see below).
3. Configure ClickHouse DSN. 

Note: that install driver linked against MDAC (which is default for Windows), some non-windows native 
applications (cygwin / msys64 based) may require driver linked against unixodbc. Build section below.

### MacOS

1. Install [homebrew](https://brew.sh/).
2. Install driver
```bash
brew install https://raw.githubusercontent.com/proller/homebrew-core/chodbc/Formula/clickhouse-odbc.rb
```
3. Add ClickHouse DSN configuration into ~/.odbc.ini file. ([sample]()) 

Note: that install driver linked against iodbc (which is default for Mac), some homebrew applications
(like python) may require unixodbc driver to work properly. In that case see Build section below.

### Linux

1. DEB/RPM packaging is not provided yet, please build & install the driver from sources.
2. Add ClickHouse DSN configuration into ~/.odbc.ini file. ([sample]())  

## Configuration

On Linux / Max you configure DSN by adding new desctions in ~/.odbc.ini
(See sample file: https://github.com/ClickHouse/clickhouse-odbc/blob/fd74398b50201ab13b535cdfab57bca86e588b37/packaging/odbc.ini.sample )

On Windows you can create/edit DSN using GUI tool through Control Panel.

The list of DSN parameters recognized by the driver is as follows:

|      Parameter      |                                                      Default value                                                       | Description                                                                                                                                                                                                                                                                                                                                                                                                              |
| :-----------------: | :----------------------------------------------------------------------------------------------------------------------: |:-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|        `Url`        |                                                          empty                                                           | URL that points to a running ClickHouse instance, may include username, password, port, database, etc.                                                                                                                                                                                                                                                                                                                   |
|       `Proto`       | deduced from `Url`, or from `Port` and `SSLMode`: `https` if `443` or `8443` or `SSLMode` is not empty, `http` otherwise | Protocol, one of: `http`, `https`                                                                                                                                                                                                                                                                                                                                                                                        |
| `Server` or `Host`  |                                                    deduced from `Url`                                                    | IP or hostname of a server with a running ClickHouse instance on it                                                                                                                                                                                                                                                                                                                                                      |
|       `Port`        |                         deduced from `Url`, or from `Proto`: `8443` if `https`, `8123` otherwise                         | Port on which the ClickHouse instance is listening                                                                                                                                                                                                                                                                                                                                                                       |
|       `Path`        |                                                         `/query`                                                         | Path portion of the URL                                                                                                                                                                                                                                                                                                                                                                                                  |
| `UID` or `Username` |                                                        `default`                                                         | User name                                                                                                                                                                                                                                                                                                                                                                                                                |
| `PWD` or `Password` |                                                          empty                                                           | Password                                                                                                                                                                                                                                                                                                                                                                                                                 |
|     `Database`      |                                                        `default`                                                         | Database name to connect to                                                                                                                                                                                                                                                                                                                                                                                              |
|      `Timeout`      |                                                           `30`                                                           | Connection timeout                                                                                                                                                                                                                                                                                                                                                                                                       |
|      `SSLMode`      |                                                          empty                                                           | Certificate verification method (used by TLS/SSL connections, ignored in Windows), one of: `allow`, `prefer`, `require`, use `allow` to enable [SSL_VERIFY_PEER](https://www.openssl.org/docs/manmaster/man3/SSL_CTX_set_verify.html) TLS/SSL certificate verification mode, [SSL_VERIFY_PEER \| SSL_VERIFY_FAIL_IF_NO_PEER_CERT](https://www.openssl.org/docs/manmaster/man3/SSL_CTX_set_verify.html) is used otherwise |
|  `PrivateKeyFile`   |                                                          empty                                                           | Path to private key file (used by TLS/SSL connections), can be empty if no private key file is used                                                                                                                                                                                                                                                                                                                      |
|  `CertificateFile`  |                                                          empty                                                           | Path to certificate file (used by TLS/SSL connections, ignored in Windows), if the private key and the certificate are stored in the same file, this can be empty if `PrivateKeyFile` is specified                                                                                                                                                                                                                       |
|    `CALocation`     |                                                          empty                                                           | Path to the file or directory containing the CA/root certificates (used by TLS/SSL connections, ignored in Windows)                                                                                                                                                                                                                                                                                                      |
|     `DriverLog`     |                                  `on` if `CMAKE_BUILD_TYPE` is `Debug`, `off` otherwise                                  | Enable or disable the extended driver logging                                                                                                                                                                                                                                                                                                                                                                            |
|   `DriverLogFile`   |               `\temp\clickhouse-odbc-driver.log`  on Windows, `/tmp/clickhouse-odbc-driver.log` otherwise                | Path to the extended driver log file (used when `DriverLog` is `on`)                                                                                                                                                                                                                                                                                                                                                     |



## Troubleshooting & bug reporting

If some software doesn't work properly with that driver, but works good with other drivers - we will be appropriate if you will be able to collect debug info.

To debug issues with the driver, first things that need to be done are:
- enabling driver manager tracing. Links may contain some irrelevant vendor-specific details.
  - on Windows/MDAC: [1](https://dev.mysql.com/doc/connector-odbc/en/connector-odbc-configuration-trace-windows.html), [2](https://www.simba.com/blog/odbc-troubleshooting-tracing/), [3](https://docs.microsoft.com/en-us/sql/odbc/reference/develop-app/enabling-tracing)
  - on Mac/iODBC: [1](https://www.simba.com/blog/odbc-troubleshooting-tracing/), [2](http://www.iodbc.org/dataspace/doc/iodbc/wiki/iodbcWiki/FAQ#Tracing%20Application%20Behavior)
  - on Linux/unixODBC: [1](https://www.simba.com/blog/odbc-troubleshooting-tracing/), [2](https://www.easysoft.com/support/kb/kb00945.html)
- enabling driver logging, see `DriverLog` and `DriverLogFile` DSN parameters above
- making sure that the application is allowed to create and write these driver log and driver manager trace files
- follow the steps leading to the issue. 

Collected log files will help to diagnose & solve the issue. 

## Driver Managers

Note, that since ODBC drivers are not used directly by a user, but rather accessed through applications, which in their turn access the driver through ODBC driver manager, user have to install the driver for the **same architecture** (32- or 64-bit) as the application that is going to access the driver. Moreover, both the driver and the application must be compiled for (and actually use during run-time) the **same ODBC driver manager implementation** (we call them "ODBC providers" here). There are three supported ODBC providers:

- ODBC driver manager associated with **MDAC** (Microsoft Data Access Components, sometimes referenced as WDAC, Windows Data Access Components) - the standard ODBC provider of Windows
- **UnixODBC** - the most common ODBC provider in Unix-like systems. Theoretically, could be used in Cygwin or MSYS/MinGW environments in Windows too.
- **iODBC** - less common ODBC provider, mainly used in Unix-like systems, however, it is the standard ODBC provider in macOS. Theoretically, could be used in Cygwin or MSYS/MinGW environments in Windows too.

If you don't see a package that matches your platforms, or the version of your system is significantly different than those of the available packages, or maybe you want to try a bleeding edge version of the code that hasn't been released yet, you can always build the driver manually from sources.

Note, that it is always a good idea to install the driver from the corresponding **native** package (<!-- `.deb`, `.rpm`, -->`.msi`, etc., which you can also easily create if you are building from sources), than use the binaries that were manually copied to some folder.

## Building from sources

The general requirements for building the driver from sources are as follows:

- CMake 3.12 and later
- C++17 and C11 capable compiler toolchain:
  - Clang 4 and later
  - GCC 7 and later
  - Xcode 10 and later
  - Microsoft Visual Studio 2017 and later
- ODBC Driver manager (MDAC / unixodbc / iODBC)
- SSL library (openssl)

Generic build scenario:
```sh
git clone --recursive git@github.com:ClickHouse/clickhouse-odbc.git
cd clickhouse-odbc
mkdir build
cd build
cmake -DCMAKE_BUILD_TYPE=RelWithDebInfo ..
cmake --build . -C RelWithDebInfo
```
Additional requirements exist for each platform, which also depend on whether packaging and/or testing is performed.

### Linux/macOS

Execute the following in the terminal to install needed dependencies:

```sh
# on Red Hat/CentOS (tested on CentOS 7)
sudo yum groupinstall "Development Tools"
sudo yum install centos-release-scl
sudo yum install devtoolset-8
sudo yum install git cmake openssl-devel unixODBC-devel # You may use libiodbc-devel INSTEAD of unixODBC-devel
scl enable devtoolset-8 -- bash # Enable Software collections for that terminal session, to use newer versions of complilers

# on Ubuntu (tested on Ubuntu 18.10, for older versions you may need to install newer c++ compiler and cmake versions)
sudo apt install build-essential git cmake libpoco-dev libssl-dev unixodbc-dev # You may use libiodbc-devel INSEAD of unixODBC-devel

# MacOS: 
# You will need Xcode 10 or later and Command Line Tools to be installed, as well as [Homebrew](https://brew.sh/).
brew install git cmake make poco openssl libiodbc # You may use unixodbc INSTEAD of libiodbc 
```

**Note:** usually on Linux you use unixODBC driver manager, and on Mac - iODBC.
In some (rare) cases you may need use other driver manager, please do it only
if you clearly understand the differences. Driver should be used with the driver
manager it was linked to.

Clone the repo with submodules:

```sh
git clone --recursive git@github.com:ClickHouse/clickhouse-odbc.git
```

Enter the cloned source tree, create a temporary build folder, and generate a Makefile for the project in it:

```sh
cd clickhouse-odbc
mkdir build
cd build

# Configuration options for the project can be specified in the next command in a form of '-Dopt=val'
# For MacOS: you may also add '-G Xcode' to the next command, in order to use Xcode as a build system or IDE, and generate the solution and project files instead of Makefile.
cmake -DCMAKE_BUILD_TYPE=RelWithDebInfo ..
```

Build the generated solution in-place:

```sh
cmake --build . -C RelWithDebInfo
cmake --build . -C RelWithDebInfo --target package
```

...and, optionally, run tests (note, that for non-unit tests, preconfigured driver and DSN entries must exist, that point to the binaries generated in this build folder):

```sh
cmake --build . -C RelWithDebInfo --target test
```

For MacOS: if you configured the project with '-G Xcode' initially, open the IDE and build `all`, `package`, and `test` targets manually from there
```
cmake --open .
```

### Windows 

CMake bundled with the recent versions of Visual Studio can be used.

An SDK required for building the ODBC driver is included in Windows SDK, which in its turn is also bundled with Visual Studio.

You will need to install WiX toolset to be able to generate `.msi` packages. You can download and install it from [WiX toolset home page](https://wixtoolset.org/).

All of the following commands have to be issued in Visual Studio Command Prompt:

- use `x86 Native Tools Command Prompt for VS 2019` or equivalent for 32-bit builds
- use `x64 Native Tools Command Prompt for VS 2019` or equivalent for 64-bit builds

Clone the repo with submodules:

```sh
git clone --recursive git@github.com:ClickHouse/clickhouse-odbc.git
```

Enter the cloned source tree, create a temporary build folder, and generate the solution and project files in it:

```sh
cd clickhouse-odbc
mkdir build
cd build

# Configuration options for the project can be specified in the next command in a form of '-Dopt=val'

# Use the following command for 32-bit build only.
cmake -A Win32 -DCMAKE_BUILD_TYPE=RelWithDebInfo ..

# Use the following command for 64-bit build only.
cmake -A x64 -DCMAKE_BUILD_TYPE=RelWithDebInfo ..
```

Build the generated solution in-place:

```sh
cmake --build . -C RelWithDebInfo
cmake --build . -C RelWithDebInfo --target package
```

...and, optionally, run tests (note, that for non-unit tests, preconfigured driver and DSN entries must exist, that point to the binaries generated in this build folder):

```sh
cmake --build . -C RelWithDebInfo --target test
```

...or open the IDE and build `all`, `package`, and `test` targets manually from there:

```sh
cmake --open .
```

### cmake options

The list of configuration options recognized during the CMake generation step is as follows:

|                 Option                 |                      Default value                       | Description                                                        |
| :------------------------------------: | :------------------------------------------------------: | :----------------------------------------------------------------- |
|           `CMAKE_BUILD_TYPE`           |                     `RelWithDebInfo`                     | Build type, one of: `Debug`, `Release`, `RelWithDebInfo`           |
|          `CH_ODBC_ENABLE_SSL`          |                           `ON`                           | Enable TLS/SSL (required for utilizing `https://` interface, etc.) |
|        `CH_ODBC_ENABLE_INSTALL`        |                           `ON`                           | Enable install targets (required for packaging)                    |
|        `CH_ODBC_ENABLE_TESTING`        |            inherits value of `BUILD_TESTING`             | Enable test targets                                                |
| `CH_ODBC_PREFER_BUNDLED_THIRD_PARTIES` |                           `ON`                           | Prefer bundled over system variants of third party libraries       |
|     `CH_ODBC_PREFER_BUNDLED_POCO`      | inherits value of `CH_ODBC_PREFER_BUNDLED_THIRD_PARTIES` | Prefer bundled over system variants of Poco library                |
|      `CH_ODBC_PREFER_BUNDLED_SSL`      |     inherits value of `CH_ODBC_PREFER_BUNDLED_POCO`      | Prefer bundled over system variants of TLS/SSL library             |
|  `CH_ODBC_PREFER_BUNDLED_GOOGLETEST`   | inherits value of `CH_ODBC_PREFER_BUNDLED_THIRD_PARTIES` | Prefer bundled over system variants of Google Test library         |
|    `CH_ODBC_PREFER_BUNDLED_NANODBC`    | inherits value of `CH_ODBC_PREFER_BUNDLED_THIRD_PARTIES` | Prefer bundled over system variants of nanodbc library             |
|     `CH_ODBC_RUNTIME_LINK_STATIC`      |                          `OFF`                           | Link with compiler and language runtime statically                 |
|   `CH_ODBC_THIRD_PARTY_LINK_STATIC`    |                           `ON`                           | Link with third party libraries statically                         |
|       `CH_ODBC_DEFAULT_DSN_ANSI`       |                 `ClickHouse DSN (ANSI)`                  | Default ANSI DSN name                                              |
|     `CH_ODBC_DEFAULT_DSN_UNICODE`      |                `ClickHouse DSN (Unicode)`                | Default Unicode DSN name                                           |
|               `TEST_DSN`               |       inherits value of `CH_ODBC_DEFAULT_DSN_ANSI`       | ANSI DSN name to use in tests                                      |
|              `TEST_DSN_W`              |     inherits value of `CH_ODBC_DEFAULT_DSN_UNICODE`      | Unicode DSN name to use in tests                                   |


### Packaging / redistributing the driver

You can just copy the library to another computer, in that case you need to 
1) install run-time dependencies on target computer
   * Windows: 
     * MDAC driver manager (preinstalled on all modern Windows systems)
     * `C++ Redistributable for Visual Studio 2017` or same for `2019`, etc.
   * Linux
```sh
# CentOS / RedHat
sudo yum install openssl unixODBC

# Debian/Ubuntu
sudo apt install openssl unixodbc
```
   * MacOS (assuming you have [Homebrew](https://brew.sh/) installed):
```sh
brew install poco openssl libiodbc
```

2) register the driver so that the corresponding ODBC provider is able to locate it.


All this involves modifying a dedicated registry keys in case of MDAC, or editing `odbcinst.ini` (for driver registration) and `odbc.ini` (for DSN definition) files for UnixODBC or iODBC, directly or indirectly.

This will be done automatically using some default values if you are installing the driver using native installers.

Otherwise, if you are configuring manually, or need to modify the default configuration created by the installer, please see the exact locations of files (or registry keys) that need to be modified.


