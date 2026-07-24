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

Omitted settings select `posix` and `bre`. The server does not infer a dialect
from document contents.

## Editor setup

The following examples configure GNU `sed` syntax with extended regular
expressions. Change `dialect` and `regexpMode` to select another supported
profile.

### Neovim 0.11+

Add this to `init.lua` or to a Lua file loaded from it:

```lua
vim.lsp.config("sed_language_server", {
  cmd = { "sed-language-server", "--stdio" },
  filetypes = { "sed" },
  init_options = {
    dialect = "gnu",
    regexpMode = "ere",
  },
})

vim.lsp.enable("sed_language_server")
```

### Emacs with Eglot

Add this to `init.el`:

```elisp
(require 'eglot)

(add-to-list 'eglot-server-programs
             '((sed-ts-mode sed-mode) .
               ("sed-language-server" "--stdio"
                :initializationOptions
                (:dialect "gnu" :regexpMode "ere"))))
```

Enable Eglot in a `sed-ts-mode` or `sed-mode` buffer with `M-x eglot`.

### Emacs with lsp-mode

Add this to `init.el`:

```elisp
(require 'lsp-mode)

(dolist (mode '(sed-ts-mode sed-mode))
  (add-to-list 'lsp-language-id-configuration `(,mode . "sed")))

(lsp-register-client
 (make-lsp-client
  :new-connection
  (lsp-stdio-connection
   (lambda () '("sed-language-server" "--stdio")))
  :activation-fn (lsp-activate-on "sed")
  :initialization-options '(:dialect "gnu" :regexpMode "ere")
  :server-id 'sed-language-server))

(add-hook 'sed-ts-mode-hook #'lsp-deferred)
(add-hook 'sed-mode-hook #'lsp-deferred)
```

The `lsp-mode` configuration registers the server locally; it does not require
an upstream `lsp-mode` configuration.

## Development

```sh
npm ci
npm run check
npm test
npm start
```

## License

[MIT](LICENSE)
