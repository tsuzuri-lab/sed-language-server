# sed-language-server

[![CI](https://github.com/tsuzuri-lab/sed-language-server/actions/workflows/ci.yml/badge.svg)](https://github.com/tsuzuri-lab/sed-language-server/actions/workflows/ci.yml)

A [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
implementation for
[POSIX `sed`](https://pubs.opengroup.org/onlinepubs/9799919799.2024edition/utilities/sed.html)
with opt-in GNU sed 4.10 syntax support.

The default profile is POSIX with basic regular expressions. BSD and
other implementation-specific extensions are outside the current scope.

## Installation

Requires Node.js 22 or later.

```sh
npm install --global @tsuzuri-lab/sed-language-server
```

Configure the LSP client to start the server with:

```sh
sed-language-server --stdio
```

## Features

The server provides:

- profile-aware diagnostics for supported POSIX and GNU sed syntax
- profile-aware command, substitute-flag, and branch-label completion
- go to definition from `b`, `t`, and GNU `T` label references

It analyzes scripts without executing them, running shell commands, or
accessing referenced files.

## Syntax profiles

The supported profile values are:

- `dialect`: `posix` or `gnu`
- `regexpMode`: `bre` or `ere`

Clients can select a profile during initialization:

```json
{
  "initializationOptions": {
    "dialect": "gnu",
    "regexpMode": "bre"
  }
}
```

They can change it for all open documents through
`workspace/didChangeConfiguration`:

```json
{
  "settings": {
    "sedLanguageServer": {
      "dialect": "gnu",
      "regexpMode": "ere"
    }
  }
}
```

Omitted settings select `posix` and `bre`. The server does not infer a dialect
from document contents.

## Development

```sh
npm ci
npm run check
npm test
npm start
```

## License

[MIT](LICENSE)
