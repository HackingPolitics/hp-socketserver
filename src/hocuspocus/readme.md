# hocuspocus server - custom fork

Hocuspocus currently (2021-07-06) has some bugs and does not support custom message types, so we
extended it here by modifying some classes.

## Changes

* Auth as documented would not work as `Hocuspocus.handleConnection()` would not stop if a
  hook throws an error -> disconnect on any errors and re-throw truthy values
* added a custom message type in `types.ts`
* handle the custom message in `Connection`: verify a given JWT and update the connection's context
* in `Connection`, on creation and on token update start a timer to disconnect the client if the JWT
  expired
* added a `JwtHelper` to support JWT handling & share a loaded key between different clases