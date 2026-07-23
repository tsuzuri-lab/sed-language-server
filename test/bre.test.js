import assert from "node:assert/strict";
import test from "node:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { createDiagnostics } from "../src/diagnostics.js";

const posixBreProfile = Object.freeze({
  dialect: "posix",
  regexpMode: "bre",
});
const posixEreProfile = Object.freeze({
  dialect: "posix",
  regexpMode: "ere",
});

function diagnosticsFor(source, syntaxProfile) {
  const document = TextDocument.create("file:///test.sed", "sed", 1, source);
  return createDiagnostics(document, syntaxProfile).map(
    ({ code, message, range }) => ({
      code,
      message,
      range,
    }),
  );
}

function invalidBackReference(number, start, end) {
  return {
    code: "bre-invalid-back-reference",
    message: `The POSIX BRE back-reference \`\\${number}\` does not refer to a preceding subexpression.`,
    range: {
      start: { line: 0, character: start },
      end: { line: 0, character: end },
    },
  };
}

test("accepts POSIX BRE back-references to preceding subexpressions", async (t) => {
  const validPatterns = [
    {
      name: "slash-delimited context address",
      source: String.raw`/\(a\)\1/p`,
    },
    {
      name: "alternate-delimited context address",
      source: String.raw`\#\(a\)\1#p`,
    },
    {
      name: "substitute pattern with multiple subexpressions",
      source: String.raw`s/\(a\)\(b\)\2\1/x/`,
    },
    {
      name: "closed nested subexpression referenced inside an outer one",
      source: String.raw`s/\(a\(b\)\2\)\1/x/`,
    },
    {
      name: "digit after a valid single-digit back-reference",
      source: String.raw`s/\(a\)\10/x/`,
    },
  ];

  for (const { name, source } of validPatterns) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${source}\n`), []);
    });
  }
});

test("ignores back-reference-like text outside POSIX BRE syntax", async (t) => {
  const validPatterns = [
    {
      name: "escaped backslash in a context address",
      source: String.raw`/\\1/p`,
    },
    {
      name: "backslash and digit inside a bracket expression",
      source: String.raw`s/[\9]/x/`,
    },
    {
      name: "digit used as the substitute delimiter",
      source: String.raw`s1\11x1`,
    },
    {
      name: "zero escape outside a bracket expression",
      source: String.raw`/\0/p`,
    },
    {
      name: "back-reference syntax in a substitute replacement",
      source: String.raw`s/a/\9/`,
    },
  ];

  for (const { name, source } of validPatterns) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${source}\n`), []);
    });
  }
});

test("reports invalid back-references in POSIX sed context addresses", async (t) => {
  const invalidPatterns = [
    {
      name: "first back-reference without a subexpression",
      source: String.raw`/\1/p`,
      number: "1",
      start: 1,
      end: 3,
    },
    {
      name: "alternate-delimited address",
      source: String.raw`\#\1#p`,
      number: "1",
      start: 2,
      end: 4,
    },
    {
      name: "second address",
      source: String.raw`1,/\2/p`,
      number: "2",
      start: 3,
      end: 5,
    },
    {
      name: "real back-reference after an escaped backslash",
      source: String.raw`/\\\1/p`,
      number: "1",
      start: 3,
      end: 5,
    },
    {
      name: "forward reference before a later subexpression",
      source: String.raw`/\1\(a\)/p`,
      number: "1",
      start: 1,
      end: 3,
    },
  ];

  for (const { name, source, number, start, end } of invalidPatterns) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${source}\n`), [
        invalidBackReference(number, start, end),
      ]);
    });
  }
});

test("reports invalid back-references in POSIX sed substitute patterns", async (t) => {
  const invalidPatterns = [
    {
      name: "back-reference without a subexpression",
      source: String.raw`s/\1/x/`,
      number: "1",
      start: 2,
      end: 4,
    },
    {
      name: "back-reference beyond the available subexpressions",
      source: String.raw`s/\(a\)\2/x/`,
      number: "2",
      start: 7,
      end: 9,
    },
    {
      name: "back-reference after a bracket expression",
      source: String.raw`s/[\1]\1/x/`,
      number: "1",
      start: 6,
      end: 8,
    },
    {
      name: "back-reference to a subexpression that is still open",
      source: String.raw`s/\(a\1\)/x/`,
      number: "1",
      start: 5,
      end: 7,
    },
  ];

  for (const { name, source, number, start, end } of invalidPatterns) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${source}\n`), [
        invalidBackReference(number, start, end),
      ]);
    });
  }
});

test("reports every invalid back-reference in one POSIX BRE", () => {
  assert.deepEqual(diagnosticsFor(`${String.raw`s/\1\2/x/`}\n`), [
    invalidBackReference("1", 2, 4),
    invalidBackReference("2", 4, 6),
  ]);
});

test("checks BRE back-references only when the syntax profile uses BRE", () => {
  const source = `${String.raw`s/\1/x/`}\n`;

  assert.deepEqual(diagnosticsFor(source, posixBreProfile), [
    invalidBackReference("1", 2, 4),
  ]);
  assert.deepEqual(diagnosticsFor(source, posixEreProfile), []);
});

test("keeps BRE diagnostics independent from other command errors", () => {
  assert.deepEqual(diagnosticsFor(`${String.raw`/\1/:label`}\n`), [
    invalidBackReference("1", 1, 3),
    {
      code: "address-too-many",
      message: "The POSIX sed `:` command does not accept addresses.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 },
      },
    },
  ]);

  assert.deepEqual(diagnosticsFor(`${String.raw`s/\1/x/z`}\n`), [
    invalidBackReference("1", 2, 4),
    {
      code: "substitute-invalid-flag",
      message: "Invalid POSIX sed substitute flag: `z`.",
      range: {
        start: { line: 0, character: 7 },
        end: { line: 0, character: 8 },
      },
    },
  ]);
});

test("does not diagnose POSIX-undefined BRE constructs", async (t) => {
  const unspecifiedPatterns = [
    {
      name: "adjacent duplication symbols",
      source: "/a**/p",
    },
    {
      name: "malformed interval expression",
      source: String.raw`/a\{1,2,3\}/p`,
    },
    {
      name: "unclosed subexpression",
      source: String.raw`/\(a/p`,
    },
  ];

  for (const { name, source } of unspecifiedPatterns) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${source}\n`), []);
    });
  }
});

test("prefers unterminated sed syntax over BRE back-reference diagnostics", async (t) => {
  const invalidCommands = [
    {
      name: "unterminated context address",
      source: String.raw`/\1p`,
      expected: {
        code: "address-unterminated-context",
        message: "This POSIX sed context address is not terminated.",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 4 },
        },
      },
    },
    {
      name: "unterminated substitute pattern",
      source: String.raw`s/\1`,
      expected: {
        code: "substitute-unterminated-pattern",
        message: "The POSIX sed substitute pattern is not terminated.",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 4 },
        },
      },
    },
    {
      name: "unterminated substitute replacement",
      source: String.raw`s/\1/x`,
      expected: {
        code: "substitute-unterminated-replacement",
        message: "The POSIX sed substitute replacement is not terminated.",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 6 },
        },
      },
    },
  ];

  for (const { name, source, expected } of invalidCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${source}\n`), [expected]);
    });
  }
});

test("keeps block separator diagnostics independent from BRE errors", () => {
  assert.deepEqual(diagnosticsFor(`${String.raw`{s/\1/x/}`}\n`), [
    invalidBackReference("1", 3, 5),
    {
      code: "block-closing-brace-missing-separator",
      message:
        "Expected a newline or semicolon before this POSIX sed closing brace.",
      range: {
        start: { line: 0, character: 8 },
        end: { line: 0, character: 9 },
      },
    },
  ]);

  assert.deepEqual(diagnosticsFor(`${String.raw`{/\1/}`}\n`), [
    invalidBackReference("1", 2, 4),
    {
      code: "address-too-many",
      message: "The POSIX sed `}` command does not accept addresses.",
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 5 },
      },
    },
    {
      code: "block-closing-brace-missing-separator",
      message:
        "Expected a newline or semicolon before this POSIX sed closing brace.",
      range: {
        start: { line: 0, character: 5 },
        end: { line: 0, character: 6 },
      },
    },
  ]);
});

test("preserves BRE errors across multiline substitute replacements", () => {
  const invalidBoundary = ["{s/\\1/first\\", "second/}", ""].join("\n");
  assert.deepEqual(diagnosticsFor(invalidBoundary), [
    invalidBackReference("1", 3, 5),
    {
      code: "block-closing-brace-missing-separator",
      message:
        "Expected a newline or semicolon before this POSIX sed closing brace.",
      range: {
        start: { line: 1, character: 7 },
        end: { line: 1, character: 8 },
      },
    },
  ]);

  const validBoundary = ["{s/\\1/first\\", "second/;}", ""].join("\n");
  assert.deepEqual(diagnosticsFor(validBoundary), [
    invalidBackReference("1", 3, 5),
  ]);
});
