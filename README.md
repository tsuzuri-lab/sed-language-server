# sed-language-server

A [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
implementation for
[POSIX `sed`](https://pubs.opengroup.org/onlinepubs/9799919799.2024edition/utilities/sed.html)
with opt-in GNU sed 4.10 syntax support.

The default profile remains POSIX with basic regular expressions. BSD and
other implementation-specific extensions are outside the current scope.

## Status

The server diagnoses malformed commands, arguments, addresses, command blocks,
substitute and transliterate commands, and invalid supported back-references.
GNU mode adds GNU command, address, substitution, and regular-expression
syntax without executing scripts, shell commands, or file operations.

It also provides:

- profile-aware command, substitute-flag, and branch-label completion
- go to definition from `b`, `t`, and GNU `T` label references

## Client setup

Language clients should start `sed-language-server` as a standard-input/output
language server and associate it with sed script files.

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

## Running the server

The executable communicates over standard input and output by default:

```sh
sed-language-server
```

The conventional explicit transport argument is also accepted:

```sh
sed-language-server --stdio
```

Language clients should start the executable using either form and communicate
with it using the Language Server Protocol.

## Development

```sh
npm ci
npm run check
npm test
npm start
```

## License

[MIT](LICENSE)
