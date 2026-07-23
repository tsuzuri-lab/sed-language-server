import assert from "node:assert/strict";
import test from "node:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { createDiagnostics } from "../src/diagnostics.js";

const posixBreProfile = Object.freeze({
  dialect: "posix",
  regexpMode: "bre",
});
const gnuBreProfile = Object.freeze({
  dialect: "gnu",
  regexpMode: "bre",
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

test("implicit diagnostics use the POSIX BRE syntax profile", () => {
  const source = "s/foo\n";
  const expected = [
    {
      code: "substitute-unterminated-pattern",
      message: "The POSIX sed substitute pattern is not terminated.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      },
    },
  ];

  assert.deepEqual(diagnosticsFor(source), expected);
  assert.deepEqual(diagnosticsFor(source, posixBreProfile), expected);
});

test("accepts every POSIX sed command at its address limit", async (t) => {
  const validCommands = [
    { name: "empty command", source: ";" },
    { name: "comment command", source: "# comment" },
    { name: "label command", source: ":loop" },
    { name: "equals command", source: "1=" },
    { name: "append command", source: "1a\\\ntext" },
    { name: "insert command", source: "1i\\\ntext" },
    { name: "quit command", source: "1q" },
    { name: "read command", source: "1r input.txt" },
    { name: "block commands", source: "1,2{\np\n}" },
    { name: "branch command", source: "1,2b loop" },
    { name: "change command", source: "1,2c\\\ntext" },
    { name: "delete command", source: "1,2d" },
    { name: "multiline delete command", source: "1,2D" },
    { name: "get command", source: "1,2g" },
    { name: "append hold-space command", source: "1,2G" },
    { name: "hold command", source: "1,2h" },
    { name: "append pattern-space command", source: "1,2H" },
    { name: "list command", source: "1,2l" },
    { name: "next command", source: "1,2n" },
    { name: "multiline next command", source: "1,2N" },
    { name: "print command", source: "1,2p" },
    { name: "multiline print command", source: "1,2P" },
    { name: "substitute command", source: "1,2s/a/b/" },
    { name: "test command", source: "1,2t loop" },
    { name: "write command", source: "1,2w output.txt" },
    { name: "exchange command", source: "1,2x" },
    { name: "transliterate command", source: "1,2y/a/b/" },
  ];

  for (const { name, source } of validCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${source}\n`), []);
    });
  }
});

test("reports command letters that are not part of POSIX sed", async (t) => {
  const unknownCommands = [
    { name: "GNU execute command", command: "e" },
    { name: "GNU filename command", command: "F" },
    { name: "GNU extended list command", command: "L" },
    { name: "GNU quiet quit command", command: "Q" },
    { name: "GNU read-line command", command: "R" },
    { name: "GNU failed-test command", command: "T" },
    { name: "GNU version command", command: "v" },
    { name: "GNU write-first-line command", command: "W" },
    { name: "GNU clear command", command: "z" },
  ];

  for (const { name, command } of unknownCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${command}\n`), [
        {
          code: "command-unknown",
          message: `Unknown POSIX sed command: \`${command}\`.`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ]);
    });
  }
});

test("accepts the z command only in the GNU syntax profile", () => {
  assert.deepEqual(diagnosticsFor("z\n", gnuBreProfile), []);
  assert.deepEqual(diagnosticsFor("z\n", posixBreProfile), [
    {
      code: "command-unknown",
      message: "Unknown POSIX sed command: `z`.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
  ]);
});

test("uses GNU in unknown-command diagnostics for the GNU syntax profile", () => {
  assert.deepEqual(diagnosticsFor("L\n", gnuBreProfile), [
    {
      code: "command-unknown",
      message: "Unknown GNU sed command: `L`.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
  ]);
});

test("reports an unknown command after an address range", () => {
  assert.deepEqual(diagnosticsFor("1,2z\n"), [
    {
      code: "command-unknown",
      message: "Unknown POSIX sed command: `z`.",
      range: {
        start: { line: 0, character: 3 },
        end: { line: 0, character: 4 },
      },
    },
  ]);
});

test("continues checking after an unknown command and a semicolon", () => {
  assert.deepEqual(diagnosticsFor("z;s/foo\n"), [
    {
      code: "command-unknown",
      message: "Unknown POSIX sed command: `z`.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
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

test("an unknown command does not hide a later closing brace", () => {
  assert.deepEqual(diagnosticsFor("{ z; }\n"), [
    {
      code: "command-unknown",
      message: "Unknown POSIX sed command: `z`.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 3 },
      },
    },
  ]);
});

test("an unknown command recovers at a closing brace without a semicolon", () => {
  assert.deepEqual(diagnosticsFor("{ z }\n"), [
    {
      code: "command-unknown",
      message: "Unknown POSIX sed command: `z`.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 3 },
      },
    },
  ]);
});

test("reports a missing command after an address", () => {
  assert.deepEqual(diagnosticsFor("1,2\n"), [
    {
      code: "command-missing",
      message: "Expected a POSIX sed command.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 3 },
      },
    },
  ]);
});

test("reports a missing command after negation", async (t) => {
  const invalidCommands = [
    {
      name: "negation without an address",
      source: "!\n",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
    {
      name: "negation after an address",
      source: "1!\n",
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 2 },
      },
    },
  ];

  for (const { name, source, range } of invalidCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        {
          code: "command-missing",
          message: "Expected a POSIX sed command.",
          range,
        },
      ]);
    });
  }
});

test("does not diagnose an omitted second address before negation", () => {
  assert.deepEqual(diagnosticsFor("1,!;p\n"), []);
});

test("preserves a third-address error before a missing negated command", () => {
  assert.deepEqual(diagnosticsFor("1,2,!;p\n"), [
    {
      code: "address-too-many",
      message: "A POSIX sed command accepts at most two addresses.",
      range: {
        start: { line: 0, character: 3 },
        end: { line: 0, character: 4 },
      },
    },
  ]);
});

test("continues checking after a missing command and a semicolon", () => {
  assert.deepEqual(diagnosticsFor("!;s/foo\n"), [
    {
      code: "command-missing",
      message: "Expected a POSIX sed command.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
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

test("reports a missing command before a closing brace and closes the block", () => {
  assert.deepEqual(diagnosticsFor("{ ! }\n"), [
    {
      code: "command-missing",
      message: "Expected a POSIX sed command.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 3 },
      },
    },
  ]);
});

test("a missing command does not hide a closing brace on the next line", () => {
  assert.deepEqual(diagnosticsFor("{\n1\n}\n"), [
    {
      code: "command-missing",
      message: "Expected a POSIX sed command.",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 1 },
      },
    },
  ]);
});

test("accepts trailing blanks and blanks before a semicolon", () => {
  assert.deepEqual(diagnosticsFor("p   \np \t; d\n"), []);
});

test("reports unexpected text after every argumentless command", async (t) => {
  const commands = [
    "=",
    "D",
    "G",
    "H",
    "N",
    "P",
    "d",
    "g",
    "h",
    "l",
    "n",
    "p",
    "q",
    "x",
  ];

  for (const command of commands) {
    await t.test(`unexpected text after ${command}`, () => {
      assert.deepEqual(diagnosticsFor(`${command}extra\n`), [
        {
          code: "command-unexpected-text",
          message: `Unexpected text after the POSIX sed \`${command}\` command.`,
          range: {
            start: { line: 0, character: 1 },
            end: { line: 0, character: 6 },
          },
        },
      ]);
    });
  }
});

test("reports a missing separator between same-line commands", () => {
  assert.deepEqual(diagnosticsFor("pd\n"), [
    {
      code: "command-unexpected-text",
      message: "Unexpected text after the POSIX sed `p` command.",
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 2 },
      },
    },
  ]);
});

test("uses a missing closing-brace separator without losing block balance", () => {
  assert.deepEqual(diagnosticsFor("{ p }\n"), [
    {
      code: "block-closing-brace-missing-separator",
      message:
        "Expected a newline or semicolon before this POSIX sed closing brace.",
      range: {
        start: { line: 0, character: 4 },
        end: { line: 0, character: 5 },
      },
    },
  ]);
});

test("rejects blanks after an argumentless command inside a block", async (t) => {
  const invalidCommands = [
    {
      name: "blank before a semicolon",
      source: "{ p ; }\n",
      range: {
        start: { line: 0, character: 3 },
        end: { line: 0, character: 4 },
      },
    },
    {
      name: "blank before a newline",
      source: "{\np \n}\n",
      range: {
        start: { line: 1, character: 1 },
        end: { line: 1, character: 2 },
      },
    },
  ];

  for (const { name, source, range } of invalidCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        {
          code: "command-unexpected-text",
          message: "Unexpected text after the POSIX sed `p` command.",
          range,
        },
      ]);
    });
  }
});

test("recovers at a closing brace after other unexpected text", () => {
  assert.deepEqual(diagnosticsFor("{ pfoo }\n"), [
    {
      code: "command-unexpected-text",
      message: "Unexpected text after the POSIX sed `p` command.",
      range: {
        start: { line: 0, character: 3 },
        end: { line: 0, character: 6 },
      },
    },
  ]);
});

test("reports unexpected text after a closing brace", () => {
  assert.deepEqual(diagnosticsFor("{\n}extra\n"), [
    {
      code: "command-unexpected-text",
      message: "Unexpected text after the POSIX sed `}` command.",
      range: {
        start: { line: 1, character: 1 },
        end: { line: 1, character: 6 },
      },
    },
  ]);
});

test("recovers at an outer closing brace when its separator is missing", () => {
  assert.deepEqual(diagnosticsFor("{{ p; } }\n"), [
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
});

test("continues checking after unexpected text and a semicolon", () => {
  assert.deepEqual(diagnosticsFor("p extra;s/foo\n"), [
    {
      code: "command-unexpected-text",
      message: "Unexpected text after the POSIX sed `p` command.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 7 },
      },
    },
    {
      code: "substitute-unterminated-pattern",
      message: "The POSIX sed substitute pattern is not terminated.",
      range: {
        start: { line: 0, character: 8 },
        end: { line: 0, character: 13 },
      },
    },
  ]);
});

test("rejects addresses on zero-address POSIX commands", async (t) => {
  const invalidCommands = [
    {
      name: "label command",
      source: "1:loop\n",
      command: ":",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
    {
      name: "comment command",
      source: "1# comment\n",
      command: "#",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
    {
      name: "closing brace",
      source: "{\n1}\n",
      command: "}",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 1 },
      },
    },
  ];

  for (const { name, source, command, range } of invalidCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        {
          code: "address-too-many",
          message: `The POSIX sed \`${command}\` command does not accept addresses.`,
          range,
        },
      ]);
    });
  }
});

test("rejects an address on an empty POSIX command", () => {
  assert.deepEqual(diagnosticsFor("1;\n"), [
    {
      code: "address-too-many",
      message: "An empty POSIX sed command does not accept addresses.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
  ]);
});

test("rejects address ranges on one-address POSIX commands", async (t) => {
  const invalidCommands = [
    { name: "append command", command: "a", source: "1,2a\\\ntext\n" },
    { name: "insert command", command: "i", source: "1,2i\\\ntext\n" },
    { name: "quit command", command: "q", source: "1,2q\n" },
    { name: "read command", command: "r", source: "1,2r input.txt\n" },
    { name: "equals command", command: "=", source: "1,2=\n" },
  ];

  for (const { name, command, source } of invalidCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        {
          code: "address-too-many",
          message: `The POSIX sed \`${command}\` command accepts at most one address.`,
          range: {
            start: { line: 0, character: 2 },
            end: { line: 0, character: 3 },
          },
        },
      ]);
    });
  }
});

test("uses the command-specific limit after an extra address comma", () => {
  assert.deepEqual(diagnosticsFor("1,2,q\n"), [
    {
      code: "address-too-many",
      message: "The POSIX sed `q` command accepts at most one address.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 3 },
      },
    },
  ]);
});

test("rejects a third address on two-address POSIX commands", async (t) => {
  const invalidCommands = [
    { name: "block command", command: "{", source: "1,2,3{\np\n}\n" },
    { name: "branch command", command: "b", source: "1,2,3b loop\n" },
    { name: "change command", command: "c", source: "1,2,3c\\\ntext\n" },
    { name: "delete command", command: "d", source: "1,2,3d\n" },
    { name: "multiline delete command", command: "D", source: "1,2,3D\n" },
    { name: "get command", command: "g", source: "1,2,3g\n" },
    {
      name: "append hold-space command",
      command: "G",
      source: "1,2,3G\n",
    },
    { name: "hold command", command: "h", source: "1,2,3h\n" },
    {
      name: "append pattern-space command",
      command: "H",
      source: "1,2,3H\n",
    },
    { name: "list command", command: "l", source: "1,2,3l\n" },
    { name: "next command", command: "n", source: "1,2,3n\n" },
    { name: "multiline next command", command: "N", source: "1,2,3N\n" },
    { name: "print command", command: "p", source: "1,2,3p\n" },
    { name: "multiline print command", command: "P", source: "1,2,3P\n" },
    {
      name: "substitute command",
      command: "s",
      source: "1,2,3s/a/b/\n",
    },
    { name: "test command", command: "t", source: "1,2,3t loop\n" },
    { name: "write command", command: "w", source: "1,2,3w output.txt\n" },
    { name: "exchange command", command: "x", source: "1,2,3x\n" },
    {
      name: "transliterate command",
      command: "y",
      source: "1,2,3y/a/b/\n",
    },
  ];

  for (const { name, command, source } of invalidCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        {
          code: "address-too-many",
          message: `The POSIX sed \`${command}\` command accepts at most two addresses.`,
          range: {
            start: { line: 0, character: 4 },
            end: { line: 0, character: 5 },
          },
        },
      ]);
    });
  }
});

test("reports one address-limit error when several addresses are excessive", () => {
  assert.deepEqual(diagnosticsFor("1,2,3,4p\n"), [
    {
      code: "address-too-many",
      message: "The POSIX sed `p` command accepts at most two addresses.",
      range: {
        start: { line: 0, character: 4 },
        end: { line: 0, character: 5 },
      },
    },
  ]);
});

test("reports a third address even when no command follows it", () => {
  assert.deepEqual(diagnosticsFor("1,2,3\n"), [
    {
      code: "address-too-many",
      message: "A POSIX sed command accepts at most two addresses.",
      range: {
        start: { line: 0, character: 4 },
        end: { line: 0, character: 5 },
      },
    },
  ]);
});

test("reports both excessive addresses and an unknown command", () => {
  assert.deepEqual(diagnosticsFor("1,2,3z\n"), [
    {
      code: "address-too-many",
      message: "A POSIX sed command accepts at most two addresses.",
      range: {
        start: { line: 0, character: 4 },
        end: { line: 0, character: 5 },
      },
    },
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

test("checks later commands after an address-limit error", () => {
  assert.deepEqual(diagnosticsFor("1,2q;s/foo\n"), [
    {
      code: "address-too-many",
      message: "The POSIX sed `q` command accepts at most one address.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 3 },
      },
    },
    {
      code: "substitute-unterminated-pattern",
      message: "The POSIX sed substitute pattern is not terminated.",
      range: {
        start: { line: 0, character: 5 },
        end: { line: 0, character: 10 },
      },
    },
  ]);
});
