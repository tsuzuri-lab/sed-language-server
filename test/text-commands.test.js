import assert from "node:assert/strict";
import test from "node:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { createDiagnostics } from "../src/diagnostics.js";

function diagnosticsFor(source) {
  const document = TextDocument.create("file:///test.sed", "sed", 1, source);
  return createDiagnostics(document).map(({ code, message, range }) => ({
    code,
    message,
    range,
  }));
}

test("accepts one line of text for every POSIX text command", async (t) => {
  for (const command of ["a", "c", "i"]) {
    await t.test(`${command} command`, () => {
      assert.deepEqual(diagnosticsFor(`${command}\\\ntext\np\n`), []);
    });
  }
});

test("accepts valid text argument boundaries", async (t) => {
  const validCommands = [
    {
      name: "empty text line",
      source: "a\\\n\np\n",
    },
    {
      name: "final text line without a newline",
      source: "a\\\ntext",
    },
    {
      name: "continued text",
      source: "a\\\nfirst\\\nsecond\np\n",
    },
    {
      name: "unspecified escape inside text",
      source: "a\\\ntext\\q\np\n",
    },
    {
      name: "unspecified trailing backslash at the end of the script",
      source: "a\\\ntext\\",
    },
  ];

  for (const { name, source } of validCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), []);
    });
  }
});

test("does not parse continued text as commands or block braces", () => {
  assert.deepEqual(diagnosticsFor("a\\\ns/foo\\\n}\np\n"), []);
});

test("ends text after an escaped trailing backslash", () => {
  assert.deepEqual(diagnosticsFor("a\\\ntext\\\\\ns/foo\n"), [
    {
      code: "substitute-unterminated-pattern",
      message: "The POSIX sed substitute pattern is not terminated.",
      range: {
        start: { line: 2, character: 0 },
        end: { line: 2, character: 5 },
      },
    },
  ]);
});

test("reports a missing backslash after every POSIX text command", async (t) => {
  for (const command of ["a", "c", "i"]) {
    await t.test(`${command} command`, () => {
      assert.deepEqual(diagnosticsFor(`${command}\np\n`), [
        {
          code: "text-missing-backslash",
          message: `Expected a backslash immediately after the POSIX sed \`${command}\` command.`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ]);
    });
  }
});

test("rejects a blank between a text command and its backslash", () => {
  assert.deepEqual(diagnosticsFor("a \\\np\n"), [
    {
      code: "text-missing-backslash",
      message:
        "Expected a backslash immediately after the POSIX sed `a` command.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
  ]);
});

test("reports text after the backslash for every POSIX text command", async (t) => {
  for (const command of ["a", "c", "i"]) {
    await t.test(`${command} command`, () => {
      assert.deepEqual(diagnosticsFor(`${command}\\extra\ntext\np\n`), [
        {
          code: "text-unexpected-after-backslash",
          message: `Unexpected text after the backslash in the POSIX sed \`${command}\` command.`,
          range: {
            start: { line: 0, character: 2 },
            end: { line: 0, character: 7 },
          },
        },
      ]);
    });
  }
});

test("reports a blank after a text command backslash", () => {
  assert.deepEqual(diagnosticsFor("a\\ \ntext\n"), [
    {
      code: "text-unexpected-after-backslash",
      message:
        "Unexpected text after the backslash in the POSIX sed `a` command.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 3 },
      },
    },
  ]);
});

test("reports a missing newline after every text command backslash", async (t) => {
  for (const command of ["a", "c", "i"]) {
    await t.test(`${command} command`, () => {
      assert.deepEqual(diagnosticsFor(`${command}\\`), [
        {
          code: "text-missing-newline",
          message: `Expected a newline after the backslash in the POSIX sed \`${command}\` command.`,
          range: {
            start: { line: 0, character: 1 },
            end: { line: 0, character: 2 },
          },
        },
      ]);
    });
  }
});

test("reports a missing first text line for every POSIX text command", async (t) => {
  for (const command of ["a", "c", "i"]) {
    await t.test(`${command} command`, () => {
      assert.deepEqual(diagnosticsFor(`${command}\\\n`), [
        {
          code: "text-missing-line",
          message: `Expected a line of text for the POSIX sed \`${command}\` command.`,
          range: {
            start: { line: 0, character: 1 },
            end: { line: 0, character: 2 },
          },
        },
      ]);
    });
  }
});

test("reports a missing continued text line", () => {
  assert.deepEqual(diagnosticsFor("a\\\nfirst\\\n"), [
    {
      code: "text-missing-line",
      message: "Expected a line of text for the POSIX sed `a` command.",
      range: {
        start: { line: 1, character: 5 },
        end: { line: 1, character: 6 },
      },
    },
  ]);
});

test("checks the next line after a text command without a backslash", () => {
  assert.deepEqual(diagnosticsFor("a\ns/foo\n"), [
    {
      code: "text-missing-backslash",
      message:
        "Expected a backslash immediately after the POSIX sed `a` command.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
    {
      code: "substitute-unterminated-pattern",
      message: "The POSIX sed substitute pattern is not terminated.",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 5 },
      },
    },
  ]);
});

test("consumes text after a header with unexpected text", () => {
  assert.deepEqual(diagnosticsFor("a\\extra\ns/foo\ns/bar\n"), [
    {
      code: "text-unexpected-after-backslash",
      message:
        "Unexpected text after the backslash in the POSIX sed `a` command.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 7 },
      },
    },
    {
      code: "substitute-unterminated-pattern",
      message: "The POSIX sed substitute pattern is not terminated.",
      range: {
        start: { line: 2, character: 0 },
        end: { line: 2, character: 5 },
      },
    },
  ]);
});

test("does not recover from a text command at a semicolon", () => {
  assert.deepEqual(diagnosticsFor("a\\;s/foo\ntext\np\n"), [
    {
      code: "text-unexpected-after-backslash",
      message:
        "Unexpected text after the backslash in the POSIX sed `a` command.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 8 },
      },
    },
  ]);
});

test("a malformed text command does not hide a closing brace on the next line", () => {
  assert.deepEqual(diagnosticsFor("{\na\n}\n"), [
    {
      code: "text-missing-backslash",
      message:
        "Expected a backslash immediately after the POSIX sed `a` command.",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 1 },
      },
    },
  ]);
});

test("a closing brace on the first text line does not close the block", () => {
  assert.deepEqual(diagnosticsFor("{\na\\\n}\n"), [
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

test("an empty text line allows the following closing brace to close the block", () => {
  assert.deepEqual(diagnosticsFor("{\na\\\n\n}\n"), []);
});

test("a malformed text header still consumes its following text line", () => {
  assert.deepEqual(diagnosticsFor("{\na\\extra\n}\n}\n"), [
    {
      code: "text-unexpected-after-backslash",
      message:
        "Unexpected text after the backslash in the POSIX sed `a` command.",
      range: {
        start: { line: 1, character: 2 },
        end: { line: 1, character: 7 },
      },
    },
  ]);
});

test("an address error does not expose a text argument as commands", () => {
  assert.deepEqual(diagnosticsFor("1,2a\\\ns/foo\np\n"), [
    {
      code: "address-too-many",
      message: "The POSIX sed `a` command accepts at most one address.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 3 },
      },
    },
  ]);
});
