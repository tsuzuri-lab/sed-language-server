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

test("accepts valid POSIX sed label commands", async (t) => {
  const validCommands = [
    {
      name: "label immediately after a colon",
      source: ":loop\n",
    },
    {
      name: "branch without a label",
      source: "b\n",
    },
    {
      name: "test without a label",
      source: "t\n",
    },
    {
      name: "branch label after a space",
      source: "b loop\n",
    },
    {
      name: "label at the end of a script without a newline",
      source: ":loop",
    },
  ];

  for (const { name, source } of validCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), []);
    });
  }
});

test("reports a missing label for a colon command", async (t) => {
  const invalidCommands = [
    {
      name: "colon followed by a newline",
      source: ":\n",
    },
    {
      name: "colon at the end of a script",
      source: ":",
    },
    {
      name: "colon followed only by spaces",
      source: ":   \n",
    },
    {
      name: "colon followed only by a tab",
      source: ":\t\n",
    },
  ];

  for (const { name, source } of invalidCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        {
          code: "label-missing",
          message: "Expected a label after the POSIX sed `:` command.",
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ]);
    });
  }
});

test("reports a missing space before branch and test labels", async (t) => {
  const invalidCommands = [
    {
      name: "branch label immediately after the command",
      command: "b",
      code: "branch-label-missing-separator",
      source: "bloop\n",
    },
    {
      name: "test label immediately after the command",
      command: "t",
      code: "test-label-missing-separator",
      source: "tloop\n",
    },
    {
      name: "branch label after a tab",
      command: "b",
      code: "branch-label-missing-separator",
      source: "b\tloop\n",
    },
    {
      name: "test label after a tab",
      command: "t",
      code: "test-label-missing-separator",
      source: "t\tloop\n",
    },
  ];

  for (const { name, command, code, source } of invalidCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        {
          code,
          message: `Expected a space between the POSIX sed \`${command}\` command and its label.`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ]);
    });
  }
});

test("treats the rest of the physical line as a label", async (t) => {
  const validCommands = [
    {
      name: "semicolon inside a colon label",
      source: ":loop;s/foo\n",
    },
    {
      name: "semicolon inside a branch label",
      source: "b loop;s/foo\n",
    },
    {
      name: "comment marker inside a test label",
      source: "t loop#not-a-comment\n",
    },
    {
      name: "structural characters and trailing blanks inside a label",
      source: ":loop; } #   \n",
    },
  ];

  for (const { name, source } of validCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), []);
    });
  }
});

test("checks the next line after a missing colon label", () => {
  assert.deepEqual(diagnosticsFor(":\nz\n"), [
    {
      code: "label-missing",
      message: "Expected a label after the POSIX sed `:` command.",
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

test("does not recover from a label separator error on the same line", () => {
  assert.deepEqual(diagnosticsFor("bloop;s/foo\nz\n"), [
    {
      code: "branch-label-missing-separator",
      message:
        "Expected a space between the POSIX sed `b` command and its label.",
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

test("accepts label commands on separate lines inside a block", () => {
  assert.deepEqual(diagnosticsFor("{\n:loop\nb loop\nt loop\n}\n"), []);
});

test("a missing colon label does not hide a closing brace on the next line", () => {
  assert.deepEqual(diagnosticsFor("{\n:\n}\n"), [
    {
      code: "label-missing",
      message: "Expected a label after the POSIX sed `:` command.",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 1 },
      },
    },
  ]);
});

test("a closing brace on a branch line is part of the label", () => {
  assert.deepEqual(diagnosticsFor("{\nb loop; }\n"), [
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

test("a later closing brace closes a block after a brace in a label", () => {
  assert.deepEqual(diagnosticsFor("{\nt }\n}\n"), []);
});

test("reports an address error together with a missing colon label", () => {
  assert.deepEqual(diagnosticsFor("1:\n"), [
    {
      code: "address-too-many",
      message: "The POSIX sed `:` command does not accept addresses.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
    {
      code: "label-missing",
      message: "Expected a label after the POSIX sed `:` command.",
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 2 },
      },
    },
  ]);
});

test("does not diagnose label resolution or portable-set restrictions", () => {
  assert.deepEqual(
    diagnosticsFor(
      ": duplicated\n:\tlabel\nb  label\nt \tlabel\n:duplicated\n:duplicated\nb unresolved\n:label#outside-portable-set\n",
    ),
    [],
  );
});
