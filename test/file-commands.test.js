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

test("accepts valid filenames for standalone read and write commands", async (t) => {
  const validCommands = [
    {
      name: "read filename after a space",
      source: "r input.txt\n",
    },
    {
      name: "write filename after a space",
      source: "w output.txt\n",
    },
    {
      name: "read filename after a tab",
      source: "r\tinput file.txt\n",
    },
    {
      name: "write filename after several blanks",
      source: "w   output file.txt\n",
    },
    {
      name: "filename at the end of a script without a newline",
      source: "r input.txt",
    },
  ];

  for (const { name, source } of validCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), []);
    });
  }
});

test("treats the rest of a read or write line as the filename", async (t) => {
  const validCommands = [
    {
      name: "semicolon at the start of a read filename",
      source: "r ;s/foo\n",
    },
    {
      name: "semicolon inside a write filename",
      source: "w output;s/foo\n",
    },
    {
      name: "comment marker inside a read filename",
      source: "r #not-a-comment\n",
    },
    {
      name: "blanks and structural characters inside a write filename",
      source: "w output file ; } #\n",
    },
  ];

  for (const { name, source } of validCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), []);
    });
  }
});

test("reports a missing filename for standalone read and write commands", async (t) => {
  const invalidCommands = [
    {
      name: "read command without a filename",
      command: "r",
      code: "read-file-missing-name",
      source: "r\n",
    },
    {
      name: "write command without a filename",
      command: "w",
      code: "write-file-missing-name",
      source: "w\n",
    },
    {
      name: "read command followed only by blanks",
      command: "r",
      code: "read-file-missing-name",
      source: "r   \n",
    },
    {
      name: "write command followed only by a tab",
      command: "w",
      code: "write-file-missing-name",
      source: "w\t\n",
    },
  ];

  for (const { name, command, code, source } of invalidCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        {
          code,
          message: `Expected a filename after the POSIX sed \`${command}\` command.`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ]);
    });
  }
});

test("reports a missing filename separator for standalone read and write commands", async (t) => {
  const invalidCommands = [
    {
      name: "read filename without a blank",
      command: "r",
      code: "read-file-missing-separator",
      source: "rinput.txt\n",
    },
    {
      name: "write filename without a blank",
      command: "w",
      code: "write-file-missing-separator",
      source: "woutput.txt\n",
    },
  ];

  for (const { name, command, code, source } of invalidCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        {
          code,
          message: `Expected a blank between the POSIX sed \`${command}\` command and its filename.`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ]);
    });
  }
});

test("checks the next line after a missing read filename", () => {
  assert.deepEqual(diagnosticsFor("r\nz\n"), [
    {
      code: "read-file-missing-name",
      message: "Expected a filename after the POSIX sed `r` command.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
    {
      code: "command-unknown",
      message: "Unknown POSIX sed command: `z`.",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 1 },
      },
    },
  ]);
});

test("does not recover from a missing filename separator on the same line", () => {
  assert.deepEqual(diagnosticsFor("woutput;s/foo\nz\n"), [
    {
      code: "write-file-missing-separator",
      message:
        "Expected a blank between the POSIX sed `w` command and its filename.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
    {
      code: "command-unknown",
      message: "Unknown POSIX sed command: `z`.",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 1 },
      },
    },
  ]);
});

test("accepts read and write commands on separate lines inside a block", () => {
  assert.deepEqual(diagnosticsFor("{\nr input\nw output\n}\n"), []);
});

test("a missing read filename does not hide a closing brace on the next line", () => {
  assert.deepEqual(diagnosticsFor("{\nr\n}\n"), [
    {
      code: "read-file-missing-name",
      message: "Expected a filename after the POSIX sed `r` command.",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 1 },
      },
    },
  ]);
});

test("a closing brace on a read command line is part of the filename", () => {
  assert.deepEqual(diagnosticsFor("{\nr input; }\n"), [
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

test("a later closing brace closes a block after a brace in a filename", () => {
  assert.deepEqual(diagnosticsFor("{\nr }\n}\n"), []);
});

test("accepts trailing blanks as part of a filename inside a block", () => {
  assert.deepEqual(diagnosticsFor("{\nr input   \n}\n"), []);
});

test("an address error does not expose a read filename as commands", () => {
  assert.deepEqual(diagnosticsFor("1,2r input;s/foo\n"), [
    {
      code: "address-too-many",
      message: "The POSIX sed `r` command accepts at most one address.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 3 },
      },
    },
  ]);
});

test("reports both an address error and a missing read filename", () => {
  assert.deepEqual(diagnosticsFor("1,2r\n"), [
    {
      code: "address-too-many",
      message: "The POSIX sed `r` command accepts at most one address.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 3 },
      },
    },
    {
      code: "read-file-missing-name",
      message: "Expected a filename after the POSIX sed `r` command.",
      range: {
        start: { line: 0, character: 3 },
        end: { line: 0, character: 4 },
      },
    },
  ]);
});
