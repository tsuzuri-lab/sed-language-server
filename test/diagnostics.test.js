import assert from "node:assert/strict";
import test from "node:test";
import { DiagnosticSeverity } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { createDiagnostics } from "../src/diagnostics.js";

function documentFor(source) {
  return TextDocument.create("file:///test.sed", "sed", 1, source);
}

function diagnosticsFor(source) {
  return createDiagnostics(documentFor(source)).map(
    ({ code, message, range }) => ({
      code,
      message,
      range,
    }),
  );
}

test("accepts valid POSIX substitute commands", async (t) => {
  const validCommands = [
    { name: "slash delimiter", source: "s/foo/bar/" },
    { name: "alternate delimiter", source: "s#/#_#g" },
    { name: "context address", source: "/route/s/api/v1/" },
    {
      name: "alternate context-address delimiter",
      source: String.raw`\%route%s/api/v1/`,
    },
    { name: "address range with negation", source: "1,3! s/foo/bar/" },
    { name: "negation without an address", source: "!s/foo/bar/" },
    { name: "escaped delimiter", source: String.raw`s/a\/b/c/` },
    { name: "delimiter inside a bracket expression", source: "s-[0-9]--g" },
    { name: "negated bracket expression", source: "s/[^^]/caret/" },
    { name: "left bracket delimiter", source: "s[foo[bar[" },
    {
      name: "left bracket context-address delimiter",
      source: String.raw`\[foo[s/bar/baz/`,
    },
    { name: "occurrence flag", source: "s/foo/bar/2" },
    { name: "multi-digit occurrence flag", source: "s/foo/bar/2047" },
    { name: "POSIX letter flags", source: "s/foo/bar/gip" },
    { name: "write flag", source: "s/foo/bar/gw output.txt" },
    { name: "another command after flags", source: "s/a/b/g;s/c/d/p" },
    { name: "newline in the replacement", source: "s/a/first\\\nsecond/" },
  ];

  for (const { name, source } of validCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${source}\n`), []);
    });
  }
});

test("accepts valid POSIX addresses", async (t) => {
  const validCommands = [
    { name: "line number", source: "42p" },
    { name: "last line", source: "$p" },
    { name: "address range", source: "1,$p" },
    { name: "context-address range", source: "/foo/,/bar/p" },
    { name: "context address", source: "/foo/p" },
    { name: "empty context address", source: "//p" },
    { name: "escaped slash delimiter", source: String.raw`/a\/b/p` },
    {
      name: "escaped backslash before the closing delimiter",
      source: String.raw`/foo\\/p`,
    },
    { name: "slash inside a bracket expression", source: "/[/]/p" },
    {
      name: "right bracket and slash inside a bracket expression",
      source: "/[]/]/p",
    },
    {
      name: "right bracket and slash inside a negated bracket expression",
      source: "/[^]/]/p",
    },
    {
      name: "right bracket collating symbol",
      source: "/[[.].]]/p",
    },
    {
      name: "alternate context-address delimiter",
      source: String.raw`\#foo#p`,
    },
    {
      name: "empty alternate-delimited context address",
      source: String.raw`\%%p`,
    },
    {
      name: "escaped alternate delimiter",
      source: String.raw`\#a\#b#p`,
    },
    {
      name: "space delimiter",
      source: String.raw`\ foo p`,
    },
    {
      name: "semicolon delimiter",
      source: String.raw`\;foo;p`,
    },
    {
      name: "carriage return delimiter",
      source: "\\\rfoo\rp\r",
    },
  ];

  for (const { name, source } of validCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${source}\n`), []);
    });
  }
});

test("reports an unterminated slash-delimited context address", () => {
  assert.deepEqual(diagnosticsFor("/foo\n"), [
    {
      code: "address-unterminated-context",
      message: "This POSIX sed context address is not terminated.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 },
      },
    },
  ]);
});

test("reports an unterminated context address with an alternate delimiter", () => {
  assert.deepEqual(diagnosticsFor("\\#foo\n"), [
    {
      code: "address-unterminated-context",
      message: "This POSIX sed context address is not terminated.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      },
    },
  ]);
});

test("does not continue a context address across a physical newline", () => {
  assert.deepEqual(diagnosticsFor("/foo\\\ns/foo/bar/\n"), [
    {
      code: "address-unterminated-context",
      message: "This POSIX sed context address is not terminated.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      },
    },
  ]);
});

test("reports a missing alternate context-address delimiter", () => {
  assert.deepEqual(diagnosticsFor("\\\n"), [
    {
      code: "address-missing-delimiter",
      message:
        "Expected a delimiter after the backslash in this POSIX sed context address.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
  ]);
});

test("reports a backslash used as an alternate context-address delimiter", () => {
  assert.deepEqual(diagnosticsFor("\\\\foo\\\\p\n"), [
    {
      code: "address-invalid-delimiter",
      message:
        "A POSIX sed context address cannot use a backslash or newline as its delimiter.",
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 2 },
      },
    },
  ]);
});

test("does not diagnose omitted address components whose results POSIX leaves undefined", async (t) => {
  const scripts = [
    { name: "second address before a command", source: "1,p\n" },
    { name: "second address at the end of a line", source: "1,\n" },
    { name: "first address", source: ",1p\n" },
    { name: "second address after a blank", source: "1, p\n" },
    {
      name: "second address before a command in a block",
      source: "{ 1, p; }\n",
    },
    { name: "second address before a semicolon", source: "{ 1,; }\n" },
  ];

  for (const { name, source } of scripts) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), []);
    });
  }
});

test("continues after an omitted address and reports an unrelated closing brace", () => {
  assert.deepEqual(diagnosticsFor("1, p; }\n"), [
    {
      code: "block-unexpected-closing-brace",
      message: "This POSIX sed closing brace has no matching opening brace.",
      range: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 7 },
      },
    },
  ]);
});

test("checks the next command after an omitted address and a semicolon", () => {
  assert.deepEqual(diagnosticsFor("1,;/foo\n"), [
    {
      code: "address-unterminated-context",
      message: "This POSIX sed context address is not terminated.",
      range: {
        start: { line: 0, character: 3 },
        end: { line: 0, character: 7 },
      },
    },
  ]);
});

test("reports a malformed second address instead of a missing address", () => {
  assert.deepEqual(diagnosticsFor("1,/foo\n"), [
    {
      code: "address-unterminated-context",
      message: "This POSIX sed context address is not terminated.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 6 },
      },
    },
  ]);
});

test("reports an unterminated alternate-delimited second address", () => {
  assert.deepEqual(diagnosticsFor("1,\\%foo\n"), [
    {
      code: "address-unterminated-context",
      message: "This POSIX sed context address is not terminated.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 7 },
      },
    },
  ]);
});

test("reports a malformed address after an earlier command", () => {
  assert.deepEqual(diagnosticsFor("p;/foo\n"), [
    {
      code: "address-unterminated-context",
      message: "This POSIX sed context address is not terminated.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 6 },
      },
    },
  ]);
});

test("does not recover at a semicolon inside an unterminated address", () => {
  assert.deepEqual(diagnosticsFor("/foo;p\n"), [
    {
      code: "address-unterminated-context",
      message: "This POSIX sed context address is not terminated.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 6 },
      },
    },
  ]);
});

test("closes a block on the line after an unterminated address", () => {
  assert.deepEqual(diagnosticsFor("{\n/foo\n}\n"), [
    {
      code: "address-unterminated-context",
      message: "This POSIX sed context address is not terminated.",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 4 },
      },
    },
  ]);
});

test("does not diagnose BRE behavior that POSIX leaves undefined", () => {
  assert.deepEqual(diagnosticsFor("/[z-a]/p\n/\\(/p\n"), []);
});

test("uses a delimiter after an unfinished bracket expression without diagnosing the undefined BRE", async (t) => {
  const scripts = [
    {
      name: "context address",
      source: "/[/p\n",
    },
    {
      name: "delimiter after a collating-symbol expression",
      source: "/[[./.]/p\n",
    },
    {
      name: "delimiter after an equivalence-class expression",
      source: "/[[=/=]/p\n",
    },
    {
      name: "alternate delimiter matching the negation character",
      source: "\\^[^foo^p\n",
    },
    {
      name: "context address without a recoverable delimiter",
      source: "/[foo\n",
    },
    {
      name: "substitute pattern without a recoverable delimiter",
      source: "s/[foo\n",
    },
  ];

  for (const { name, source } of scripts) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), []);
    });
  }
});

test("reports independent errors after recovering from an undefined BRE", () => {
  assert.deepEqual(diagnosticsFor("/[/z\ns/[/x/e\n"), [
    {
      code: "command-unknown",
      message: "Unknown POSIX sed command: `z`.",
      range: {
        start: { line: 0, character: 3 },
        end: { line: 0, character: 4 },
      },
    },
    {
      code: "substitute-invalid-flag",
      message: "Invalid POSIX sed substitute flag: `e`.",
      range: {
        start: { line: 1, character: 6 },
        end: { line: 1, character: 7 },
      },
    },
  ]);
});

test("does not recover an undefined BRE at an escaped delimiter", async (t) => {
  const scripts = [
    {
      name: "context address",
      source: String.raw`/[\/z`,
    },
    {
      name: "substitute pattern",
      source: String.raw`s/[\/x`,
    },
  ];

  for (const { name, source } of scripts) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${source}\n`), []);
    });
  }
});

test("still recovers an undefined BRE at a delimiter after two backslashes", () => {
  assert.deepEqual(diagnosticsFor(String.raw`/[\\/z`), [
    {
      code: "command-unknown",
      message: "Unknown POSIX sed command: `z`.",
      range: {
        start: { line: 0, character: 5 },
        end: { line: 0, character: 6 },
      },
    },
  ]);
});

test("does not diagnose syntax after an unspecified escaped left-bracket delimiter", async (t) => {
  const scripts = [
    {
      name: "substitute pattern",
      source: String.raw`s[\[x[y[z`,
    },
    {
      name: "context address",
      source: String.raw`\[\[x[y`,
    },
  ];

  for (const { name, source } of scripts) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${source}\n`), []);
    });
  }
});

test("ignores lines that are not substitute commands", () => {
  assert.deepEqual(diagnosticsFor("# s/foo\np\n2d\n"), []);
});

test("does not parse POSIX text arguments as substitute commands", () => {
  const script = "a\\\ns\\\nstill text\np\n";

  assert.deepEqual(diagnosticsFor(script), []);
});

test("treats the rest of a write flag line as the filename", () => {
  assert.deepEqual(diagnosticsFor("s/a/b/w output;s/unfinished\n"), []);
});

test("accepts balanced and nested POSIX sed blocks", () => {
  const script = "1{\n  /foo/{ s/{/}/; p; }\n}\n";

  assert.deepEqual(diagnosticsFor(script), []);
});

test("accepts a transliterate command followed by a closing brace", () => {
  const script = "{ y{a{b{; }\n";

  assert.deepEqual(diagnosticsFor(script), []);
});

test("accepts valid POSIX transliterate commands", async (t) => {
  const validCommands = [
    { name: "slash delimiter", source: "y/abc/xyz/" },
    { name: "alternate delimiter", source: "y#/#_#" },
    { name: "escaped delimiter", source: String.raw`y/a\/b/c\/d/` },
    { name: "escaped backslash", source: String.raw`y/\\/x/` },
    { name: "n delimiter", source: String.raw`yn\nnxn` },
    {
      name: "carriage return delimiter",
      source: "y\rabc\rxyz\r",
    },
    {
      name: "semicolon inside a string",
      source: "y/;/x/;s/a/b/",
    },
    {
      name: "semicolon delimiter",
      source: "y;a;b;;s/c/d/",
    },
  ];

  for (const { name, source } of validCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${source}\n`), []);
    });
  }
});

test("reports a missing transliterate delimiter", () => {
  assert.deepEqual(diagnosticsFor("y\n"), [
    {
      code: "transliterate-missing-delimiter",
      message: "Expected a delimiter after the POSIX sed `y` command.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
  ]);
});

test("reports a missing transliterate delimiter before a CRLF newline", () => {
  assert.deepEqual(diagnosticsFor("y\r\n"), [
    {
      code: "transliterate-missing-delimiter",
      message: "Expected a delimiter after the POSIX sed `y` command.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
  ]);
});

test("accepts a carriage return delimiter without a final newline", () => {
  assert.deepEqual(diagnosticsFor("y\rabc\rxyz\r"), []);
});

test("reports a backslash used as the transliterate delimiter", () => {
  assert.deepEqual(diagnosticsFor("y\\foo\\bar\\\n"), [
    {
      code: "transliterate-invalid-delimiter",
      message:
        "A POSIX sed `y` command cannot use a backslash or newline as its delimiter.",
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 2 },
      },
    },
  ]);
});

test("reports an unterminated first transliterate string", () => {
  assert.deepEqual(diagnosticsFor("y/foo\n"), [
    {
      code: "transliterate-unterminated-first-string",
      message:
        "The first string in this POSIX sed `y` command is not terminated.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      },
    },
  ]);
});

test("does not continue a transliterate string across a physical newline", () => {
  assert.deepEqual(diagnosticsFor("y/foo\\\ns/bar/baz/\n"), [
    {
      code: "transliterate-unterminated-first-string",
      message:
        "The first string in this POSIX sed `y` command is not terminated.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 6 },
      },
    },
  ]);
});

test("reports an unterminated second transliterate string", () => {
  assert.deepEqual(diagnosticsFor("y/foo/bar\n"), [
    {
      code: "transliterate-unterminated-second-string",
      message:
        "The second string in this POSIX sed `y` command is not terminated.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 9 },
      },
    },
  ]);
});

test("reports a later substitute error after a transliterate command", () => {
  assert.deepEqual(diagnosticsFor("y/a/b/;s/c\n"), [
    {
      code: "substitute-unterminated-pattern",
      message: "The POSIX sed substitute pattern is not terminated.",
      range: {
        start: { line: 0, character: 7 },
        end: { line: 0, character: 10 },
      },
    },
  ]);
});

test("reports unexpected text after a transliterate command", () => {
  assert.deepEqual(diagnosticsFor("y/a/b/x\n"), [
    {
      code: "command-unexpected-text",
      message: "Unexpected text after the POSIX sed `y` command.",
      range: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 7 },
      },
    },
  ]);
});

test("checks a command after blanks and a semicolon following a transliterate command", () => {
  assert.deepEqual(diagnosticsFor("y/a/b/ ;s/c\n"), [
    {
      code: "substitute-unterminated-pattern",
      message: "The POSIX sed substitute pattern is not terminated.",
      range: {
        start: { line: 0, character: 8 },
        end: { line: 0, character: 11 },
      },
    },
  ]);
});

test("marks every published diagnostic as an error from sed-language-server", () => {
  const diagnostics = createDiagnostics(documentFor("z\ns/foo\n}\n"));

  assert.deepEqual(
    diagnostics.map(({ code }) => code),
    [
      "command-unknown",
      "substitute-unterminated-pattern",
      "block-unexpected-closing-brace",
    ],
  );
  for (const diagnostic of diagnostics) {
    assert.equal(diagnostic.severity, DiagnosticSeverity.Error);
    assert.equal(diagnostic.source, "sed-language-server");
  }
});

test("closes a block after a missing transliterate delimiter", () => {
  assert.deepEqual(diagnosticsFor("{\ny\n}\n"), [
    {
      code: "transliterate-missing-delimiter",
      message: "Expected a delimiter after the POSIX sed `y` command.",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 1 },
      },
    },
  ]);
});

test("finds a closing brace after a multiline substitute replacement", () => {
  const script = "{\ns/a/first\\\n}/; }\n";

  assert.deepEqual(diagnosticsFor(script), []);
});

test("ignores braces in comments, substitute commands, and text arguments", () => {
  const script = "# }\na\\\n{\ns/{/}/\n";

  assert.deepEqual(diagnosticsFor(script), []);
});

test("reports a closing brace without a matching opening brace", () => {
  assert.deepEqual(diagnosticsFor("s/a/b/\n}\n"), [
    {
      code: "block-unexpected-closing-brace",
      message: "This POSIX sed closing brace has no matching opening brace.",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 1 },
      },
    },
  ]);
});

test("reports an opening brace that is not closed", () => {
  assert.deepEqual(diagnosticsFor("1{\n  s/a/b/\n"), [
    {
      code: "block-unclosed-opening-brace",
      message: "This POSIX sed opening brace is not closed.",
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 2 },
      },
    },
  ]);
});

test("reports the outer opening brace when only the inner block is closed", () => {
  assert.deepEqual(diagnosticsFor("{\n  {\n  }\n"), [
    {
      code: "block-unclosed-opening-brace",
      message: "This POSIX sed opening brace is not closed.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
  ]);
});

test("reports a missing substitute delimiter", () => {
  assert.deepEqual(diagnosticsFor("s\n"), [
    {
      code: "substitute-missing-delimiter",
      message: "Expected a delimiter after the POSIX sed `s` command.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
  ]);
});

test("reports a backslash used as the substitute delimiter", () => {
  assert.deepEqual(diagnosticsFor("s\\foo\\bar\\"), [
    {
      code: "substitute-invalid-delimiter",
      message:
        "A POSIX sed `s` command cannot use a backslash or newline as its delimiter.",
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 2 },
      },
    },
  ]);
});

test("reports an unterminated substitute pattern after an address", () => {
  assert.deepEqual(diagnosticsFor("p\n2s/foo\n"), [
    {
      code: "substitute-unterminated-pattern",
      message: "The POSIX sed substitute pattern is not terminated.",
      range: {
        start: { line: 1, character: 1 },
        end: { line: 1, character: 6 },
      },
    },
  ]);
});

test("reports an unterminated substitute replacement", () => {
  assert.deepEqual(diagnosticsFor("s/foo/bar\n"), [
    {
      code: "substitute-unterminated-replacement",
      message: "The POSIX sed substitute replacement is not terminated.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 9 },
      },
    },
  ]);
});

test("reports an unterminated substitute command after a semicolon", () => {
  assert.deepEqual(diagnosticsFor("p;s/foo\n"), [
    {
      code: "substitute-unterminated-pattern",
      message: "The POSIX sed substitute pattern is not terminated.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 7 },
      },
    },
  ]);
});

test("reports an unterminated substitute command after a leading empty command", () => {
  assert.deepEqual(diagnosticsFor(";s/foo\n"), [
    {
      code: "substitute-unterminated-pattern",
      message: "The POSIX sed substitute pattern is not terminated.",
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 6 },
      },
    },
  ]);
});

test("reports a later unterminated substitute command on the same line", () => {
  assert.deepEqual(diagnosticsFor("s/a/b/;s/c\n"), [
    {
      code: "substitute-unterminated-pattern",
      message: "The POSIX sed substitute pattern is not terminated.",
      range: {
        start: { line: 0, character: 7 },
        end: { line: 0, character: 10 },
      },
    },
  ]);
});

test("reports a command after a multiline substitute replacement", () => {
  const script = "s/a/first\\\nsecond/;s/b\n";

  assert.deepEqual(diagnosticsFor(script), [
    {
      code: "substitute-unterminated-pattern",
      message: "The POSIX sed substitute pattern is not terminated.",
      range: {
        start: { line: 1, character: 8 },
        end: { line: 1, character: 11 },
      },
    },
  ]);
});

test("reports an unterminated substitute command after addressless negation", () => {
  assert.deepEqual(diagnosticsFor("!s/foo\n"), [
    {
      code: "substitute-unterminated-pattern",
      message: "The POSIX sed substitute pattern is not terminated.",
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 6 },
      },
    },
  ]);
});

test("reports a flag that is not part of POSIX sed", () => {
  assert.deepEqual(diagnosticsFor("s/a/b/e\n"), [
    {
      code: "substitute-invalid-flag",
      message: "Invalid POSIX sed substitute flag: `e`.",
      range: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 7 },
      },
    },
  ]);
});

test("reports zero when it starts an occurrence-number flag", async (t) => {
  const invalidCommands = [
    {
      name: "zero at the beginning of the flag field",
      source: "s/a/b/0\n",
      character: 6,
    },
    {
      name: "zero after a letter flag",
      source: "s/a/b/g0\n",
      character: 7,
    },
  ];

  for (const { name, source, character } of invalidCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        {
          code: "substitute-invalid-flag",
          message: "Invalid POSIX sed substitute flag: `0`.",
          range: {
            start: { line: 0, character },
            end: { line: 0, character: character + 1 },
          },
        },
      ]);
    });
  }
});

test("recovers at a semicolon after an invalid flag to close a block", () => {
  assert.deepEqual(diagnosticsFor("{ s/a/b/e; }\n"), [
    {
      code: "substitute-invalid-flag",
      message: "Invalid POSIX sed substitute flag: `e`.",
      range: {
        start: { line: 0, character: 8 },
        end: { line: 0, character: 9 },
      },
    },
  ]);
});

test("reports a closing brace after recovering from an invalid flag", () => {
  assert.deepEqual(diagnosticsFor("s/a/b/e; }\n"), [
    {
      code: "substitute-invalid-flag",
      message: "Invalid POSIX sed substitute flag: `e`.",
      range: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 7 },
      },
    },
    {
      code: "block-unexpected-closing-brace",
      message: "This POSIX sed closing brace has no matching opening brace.",
      range: {
        start: { line: 0, character: 9 },
        end: { line: 0, character: 10 },
      },
    },
  ]);
});

test("reports a write flag without a filename", () => {
  assert.deepEqual(diagnosticsFor("s/a/b/w\n"), [
    {
      code: "substitute-write-file-missing-name",
      message: "Expected a filename after the POSIX sed substitute `w` flag.",
      range: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 7 },
      },
    },
  ]);
});

test("reports a missing blank after the write flag", () => {
  assert.deepEqual(diagnosticsFor("s/a/b/woutput.txt\n"), [
    {
      code: "substitute-write-file-missing-separator",
      message:
        "Expected a blank between the POSIX sed `w` flag and its filename.",
      range: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 7 },
      },
    },
  ]);
});

test("reports a write flag followed only by blanks", () => {
  assert.deepEqual(diagnosticsFor("s/a/b/w   \n"), [
    {
      code: "substitute-write-file-missing-name",
      message: "Expected a filename after the POSIX sed substitute `w` flag.",
      range: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 7 },
      },
    },
  ]);
});
