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

test("GNU label commands end at semicolons while POSIX labels consume the physical line", async (t) => {
  const cases = [
    {
      name: "colon label",
      source: ": loop ;s/foo\n",
      substituteStart: 8,
      substituteEnd: 13,
    },
    {
      name: "branch label",
      source: "b loop;s/foo\n",
      substituteStart: 7,
      substituteEnd: 12,
    },
    {
      name: "test label",
      source: "t loop;s/foo\n",
      substituteStart: 7,
      substituteEnd: 12,
    },
  ];

  for (const { name, source, substituteStart, substituteEnd } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, posixBreProfile), []);
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), [
        {
          code: "substitute-unterminated-pattern",
          message: "The GNU sed substitute pattern is not terminated.",
          range: {
            start: { line: 0, character: substituteStart },
            end: { line: 0, character: substituteEnd },
          },
        },
      ]);
    });
  }
});

test("GNU branch labels accept no separator, spaces, and tabs without weakening POSIX rules", async (t) => {
  const cases = [
    {
      name: "branch label without a separator",
      command: "b",
      source: "bloop;s/foo\n",
      posixCode: "branch-label-missing-separator",
      substituteStart: 6,
      substituteEnd: 11,
    },
    {
      name: "branch label after a tab",
      command: "b",
      source: "b\tloop;s/foo\n",
      posixCode: "branch-label-missing-separator",
      substituteStart: 7,
      substituteEnd: 12,
    },
    {
      name: "test label without a separator",
      command: "t",
      source: "tloop;s/foo\n",
      posixCode: "test-label-missing-separator",
      substituteStart: 6,
      substituteEnd: 11,
    },
    {
      name: "test label after a tab",
      command: "t",
      source: "t\tloop;s/foo\n",
      posixCode: "test-label-missing-separator",
      substituteStart: 7,
      substituteEnd: 12,
    },
  ];

  for (const {
    name,
    command,
    source,
    posixCode,
    substituteStart,
    substituteEnd,
  } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, posixBreProfile), [
        {
          code: posixCode,
          message: `Expected a space between the POSIX sed \`${command}\` command and its label.`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ]);
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), [
        {
          code: "substitute-unterminated-pattern",
          message: "The GNU sed substitute pattern is not terminated.",
          range: {
            start: { line: 0, character: substituteStart },
            end: { line: 0, character: substituteEnd },
          },
        },
      ]);
    });
  }
});

test("GNU labels end before closing braces while POSIX keeps the brace in the label", async (t) => {
  const cases = [
    { name: "colon label", source: "{:loop}\n" },
    { name: "branch label", source: "{\nb loop}\n" },
    { name: "test label", source: "{\nt loop}\n" },
  ];

  for (const { name, source } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, posixBreProfile), [
        {
          code: "block-unclosed-opening-brace",
          message: "This POSIX sed opening brace is not closed.",
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ]);
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
    });
  }
});

test("GNU treats a comment marker as a label boundary", async (t) => {
  const cases = [
    {
      name: "colon requires a label before the comment",
      command: ":",
      source: ":#comment\n",
      posixDiagnostics: [],
      gnuDiagnostics: [
        {
          code: "label-missing",
          message: "Expected a label after the GNU sed `:` command.",
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ],
    },
    {
      name: "branch omits its optional label before the comment",
      command: "b",
      source: "b#comment\n",
      posixDiagnostics: [
        {
          code: "branch-label-missing-separator",
          message:
            "Expected a space between the POSIX sed `b` command and its label.",
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ],
      gnuDiagnostics: [],
    },
    {
      name: "test omits its optional label before the comment",
      command: "t",
      source: "t#comment\n",
      posixDiagnostics: [
        {
          code: "test-label-missing-separator",
          message:
            "Expected a space between the POSIX sed `t` command and its label.",
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ],
      gnuDiagnostics: [],
    },
  ];

  for (const { name, source, posixDiagnostics, gnuDiagnostics } of cases) {
    await t.test(name, () => {
      assert.deepEqual(
        diagnosticsFor(source, posixBreProfile),
        posixDiagnostics,
      );
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), gnuDiagnostics);
    });
  }
});

test("GNU accepts direct and nested closing-brace command boundaries", async (t) => {
  const cases = [
    {
      name: "empty block",
      source: "{}\n",
      closingBraces: [1],
    },
    {
      name: "command directly before a closing brace",
      source: "{p}\n",
      closingBraces: [2],
    },
    {
      name: "nested blocks",
      source: "{{p}}\n",
      closingBraces: [3, 4],
    },
    {
      name: "command after a closed block and semicolon",
      source: "{p};q\n",
      closingBraces: [2],
    },
  ];

  for (const { name, source, closingBraces } of cases) {
    await t.test(name, () => {
      assert.deepEqual(
        diagnosticsFor(source, posixBreProfile),
        closingBraces.map((character) => ({
          code: "block-closing-brace-missing-separator",
          message:
            "Expected a newline or semicolon before this POSIX sed closing brace.",
          range: {
            start: { line: 0, character },
            end: { line: 0, character: character + 1 },
          },
        })),
      );
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
    });
  }
});

test("a comment marker terminates a general command only in GNU mode", () => {
  const source = "p# this is a comment; s/foo\n";

  assert.deepEqual(diagnosticsFor(source, posixBreProfile), [
    {
      code: "command-unexpected-text",
      message: "Unexpected text after the POSIX sed `p` command.",
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 20 },
      },
    },
    {
      code: "substitute-unterminated-pattern",
      message: "The POSIX sed substitute pattern is not terminated.",
      range: {
        start: { line: 0, character: 22 },
        end: { line: 0, character: 27 },
      },
    },
  ]);
  assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
});

test("GNU recovery never parses semicolons inside comments", async (t) => {
  const cases = [
    {
      name: "unexpected text after a command",
      source: "p extra# comment;s/foo\n",
      expected: {
        code: "command-unexpected-text",
        message: "Unexpected text after the GNU sed `p` command.",
        range: {
          start: { line: 0, character: 2 },
          end: { line: 0, character: 7 },
        },
      },
    },
    {
      name: "invalid substitute flag",
      source: "s/a/b/X# comment;s/foo\n",
      expected: {
        code: "substitute-invalid-flag",
        message: "Invalid GNU sed substitute flag: `X`.",
        range: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 7 },
        },
      },
    },
    {
      name: "unknown command",
      source: "u# comment;s/foo\n",
      expected: {
        code: "command-unknown",
        message: "Unknown GNU sed command: `u`.",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
      },
    },
  ];

  for (const { name, source, expected } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), [expected]);
    });
  }
});

test("GNU recovery exposes a top-level closing brace after invalid text", () => {
  assert.deepEqual(diagnosticsFor("p extra}\n", gnuBreProfile), [
    {
      code: "command-unexpected-text",
      message: "Unexpected text after the GNU sed `p` command.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 7 },
      },
    },
    {
      code: "block-unexpected-closing-brace",
      message: "This GNU sed closing brace has no matching opening brace.",
      range: {
        start: { line: 0, character: 7 },
        end: { line: 0, character: 8 },
      },
    },
  ]);
});

test("GNU inline text for a, c, and i consumes semicolons, braces, and comment markers", async (t) => {
  for (const command of ["a", "c", "i"]) {
    await t.test(`${command} inline text`, () => {
      const source = `${command} text; } # not syntax\n`;

      assert.deepEqual(diagnosticsFor(source, posixBreProfile), [
        {
          code: "text-missing-backslash",
          message: `Expected a backslash immediately after the POSIX sed \`${command}\` command.`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ]);
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
    });
  }
});

test("GNU accepts same-line text after a backslash while POSIX requires a newline", async (t) => {
  for (const command of ["a", "c", "i"]) {
    await t.test(`${command} same-line backslash text`, () => {
      const source = `${command}\\text; } # not syntax\np\n`;

      assert.deepEqual(diagnosticsFor(source, posixBreProfile), [
        {
          code: "text-unexpected-after-backslash",
          message: `Unexpected text after the backslash in the POSIX sed \`${command}\` command.`,
          range: {
            start: { line: 0, character: 2 },
            end: { line: 0, character: 22 },
          },
        },
      ]);
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
    });
  }
});

test("portable text and its continued lines stay opaque in both dialects", async (t) => {
  for (const command of ["a", "c", "i"]) {
    await t.test(`${command} portable text`, () => {
      const source = `${command}\\\nfirst\\\ns/foo; } # still text\np\n`;

      assert.deepEqual(diagnosticsFor(source, posixBreProfile), []);
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
    });
  }
});

test("GNU accepts empty final text forms but rejects a bare text command at end of input", async (t) => {
  for (const command of ["a", "c", "i"]) {
    await t.test(`${command} command`, () => {
      assert.deepEqual(diagnosticsFor(`${command}\\`, gnuBreProfile), []);
      assert.deepEqual(diagnosticsFor(`${command}\\\n`, gnuBreProfile), []);
      assert.deepEqual(diagnosticsFor(command, gnuBreProfile), [
        {
          code: "text-missing-argument",
          message: `Expected text or a backslash after the GNU sed \`${command}\` command.`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ]);
    });
  }
});

test("a trailing backslash continues GNU inline text onto the next physical line", () => {
  const source = "a first\\\ne\np\n";

  assert.deepEqual(diagnosticsFor(source, posixBreProfile), [
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
      code: "command-unknown",
      message: "Unknown POSIX sed command: `e`.",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 1 },
      },
    },
  ]);
  assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
});

test("GNU standalone r and w filenames do not require a separator", async (t) => {
  const cases = [
    {
      name: "read filename",
      command: "r",
      source: "rinput.txt\n",
      code: "read-file-missing-separator",
    },
    {
      name: "write filename",
      command: "w",
      source: "woutput.txt\n",
      code: "write-file-missing-separator",
    },
  ];

  for (const { name, command, source, code } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, posixBreProfile), [
        {
          code,
          message: `Expected a blank between the POSIX sed \`${command}\` command and its filename.`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ]);
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
    });
  }
});

test("standalone filenames remain opaque through the physical line", async (t) => {
  const sources = [
    "r input; s/foo } # filename\n",
    "w output; s/foo } # filename\n",
  ];

  for (const source of sources) {
    await t.test(source[0] === "r" ? "read filename" : "write filename", () => {
      assert.deepEqual(diagnosticsFor(source, posixBreProfile), []);
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
    });
  }
});

test("GNU substitute w filenames do not require a separator and stay opaque", () => {
  const sourceWithoutSeparator = "s/a/b/woutput;s/foo } # filename\n";

  assert.deepEqual(diagnosticsFor(sourceWithoutSeparator, posixBreProfile), [
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
  assert.deepEqual(diagnosticsFor(sourceWithoutSeparator, gnuBreProfile), []);

  const sourceWithSeparator = "s/a/b/w output;s/foo } # filename\n";
  assert.deepEqual(diagnosticsFor(sourceWithSeparator, posixBreProfile), []);
  assert.deepEqual(diagnosticsFor(sourceWithSeparator, gnuBreProfile), []);
});

test("GNU raises the address limit for a, i, equals, and r to two", async (t) => {
  const cases = [
    {
      name: "append command",
      command: "a",
      source: "1,2a\\\ntext\n",
    },
    {
      name: "insert command",
      command: "i",
      source: "1,2i\\\ntext\n",
    },
    {
      name: "equals command",
      command: "=",
      source: "1,2=\n",
    },
    {
      name: "read command",
      command: "r",
      source: "1,2r file\n",
    },
  ];

  for (const { name, command, source } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, posixBreProfile), [
        {
          code: "address-too-many",
          message: `The POSIX sed \`${command}\` command accepts at most one address.`,
          range: {
            start: { line: 0, character: 2 },
            end: { line: 0, character: 3 },
          },
        },
      ]);
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
    });
  }
});

test("GNU q and l accept optional unsigned decimal arguments", async (t) => {
  const hugeUnsigned = "9".repeat(256);
  const cases = [
    {
      name: "zero exit status",
      command: "q",
      source: "q0\n",
      argumentStart: 1,
      argumentEnd: 2,
    },
    {
      name: "spaced exit status followed by a command",
      command: "q",
      source: "q 42;p\n",
      argumentStart: 2,
      argumentEnd: 4,
    },
    {
      name: "huge exit status",
      command: "q",
      source: `q${hugeUnsigned};p\n`,
      argumentStart: 1,
      argumentEnd: 1 + hugeUnsigned.length,
    },
    {
      name: "zero line-wrap length",
      command: "l",
      source: "l0\n",
      argumentStart: 1,
      argumentEnd: 2,
    },
    {
      name: "spaced line-wrap length followed by a command",
      command: "l",
      source: "l 72;p\n",
      argumentStart: 2,
      argumentEnd: 4,
    },
    {
      name: "huge line-wrap length",
      command: "l",
      source: `l${hugeUnsigned};p\n`,
      argumentStart: 1,
      argumentEnd: 1 + hugeUnsigned.length,
    },
  ];

  for (const { name, command, source, argumentStart, argumentEnd } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, posixBreProfile), [
        {
          code: "command-unexpected-text",
          message: `Unexpected text after the POSIX sed \`${command}\` command.`,
          range: {
            start: { line: 0, character: argumentStart },
            end: { line: 0, character: argumentEnd },
          },
        },
      ]);
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
    });
  }
});

test("GNU q and l reject signs and text after an unsigned decimal argument", async (t) => {
  const cases = [
    {
      name: "negative value",
      suffix: "-1",
      posixStart: 1,
      posixEnd: 3,
      gnuStart: 1,
      gnuEnd: 3,
    },
    {
      name: "explicit positive sign",
      suffix: "+1",
      posixStart: 1,
      posixEnd: 3,
      gnuStart: 1,
      gnuEnd: 3,
    },
    {
      name: "text after digits",
      suffix: "12x",
      posixStart: 1,
      posixEnd: 4,
      gnuStart: 3,
      gnuEnd: 4,
    },
  ];

  for (const command of ["q", "l"]) {
    for (const {
      name,
      suffix,
      posixStart,
      posixEnd,
      gnuStart,
      gnuEnd,
    } of cases) {
      await t.test(`${command} ${name}`, () => {
        const source = `${command}${suffix};p\n`;

        assert.deepEqual(diagnosticsFor(source, posixBreProfile), [
          {
            code: "command-unexpected-text",
            message: `Unexpected text after the POSIX sed \`${command}\` command.`,
            range: {
              start: { line: 0, character: posixStart },
              end: { line: 0, character: posixEnd },
            },
          },
        ]);
        assert.deepEqual(diagnosticsFor(source, gnuBreProfile), [
          {
            code: "command-unexpected-text",
            message: `Unexpected text after the GNU sed \`${command}\` command.`,
            range: {
              start: { line: 0, character: gnuStart },
              end: { line: 0, character: gnuEnd },
            },
          },
        ]);
      });
    }
  }
});
