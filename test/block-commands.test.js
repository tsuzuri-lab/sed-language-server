import assert from "node:assert/strict";
import test from "node:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { createDiagnostics } from "../src/diagnostics.js";

const missingClosingSeparatorMessage =
  "Expected a newline or semicolon before this POSIX sed closing brace.";

function diagnosticsFor(source) {
  const document = TextDocument.create("file:///test.sed", "sed", 1, source);
  return createDiagnostics(document).map(({ code, message, range }) => ({
    code,
    message,
    range,
  }));
}

test("accepts properly terminated POSIX sed command blocks", async (t) => {
  const validBlocks = [
    {
      name: "command terminated by a semicolon",
      source: "{p;}\n",
    },
    {
      name: "optional blanks around braces",
      source: "{ p; }\n",
    },
    {
      name: "command terminated by a newline",
      source: "{\np\n}\n",
    },
    {
      name: "empty block with newlines",
      source: "{\n}\n",
    },
    {
      name: "empty command before the closing brace",
      source: "{;}\n",
    },
    {
      name: "command after a closed block",
      source: "{p;}   ; q\n",
    },
    {
      name: "nested blocks terminated by semicolons",
      source: "{{p;};}\n",
    },
    {
      name: "substitute and transliterate commands",
      source: "{s/a/b/;y/a/b/;}\n",
    },
    {
      name: "closing brace in a comment",
      source: "{\n# }\n}\n",
    },
    {
      name: "closing brace in a substitute output filename",
      source: "{\ns/a/b/w }\n}\n",
    },
    {
      name: "blanks after a nested block command",
      source: "{\n{p;}   \n}\n",
    },
    {
      name: "trailing blanks in a branch label",
      source: "{\nb loop   \n}\n",
    },
    {
      name: "block at the end of a script without a newline",
      source: "{p;}",
    },
  ];

  for (const { name, source } of validBlocks) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), []);
    });
  }
});

test("reports closing braces without a newline or semicolon separator", async (t) => {
  const invalidBlocks = [
    {
      name: "empty same-line block",
      source: "{}\n",
      character: 1,
    },
    {
      name: "blanks do not make a same-line empty block valid",
      source: "{ }\n",
      character: 2,
    },
    {
      name: "argumentless command before the brace",
      source: "{p}\n",
      character: 2,
    },
    {
      name: "blanks do not terminate the preceding command",
      source: "{ p }\n",
      character: 4,
    },
    {
      name: "substitute command before the brace",
      source: "{s/a/b/}\n",
      character: 7,
    },
    {
      name: "substitute flags before the brace",
      source: "{s/a/b/g}\n",
      character: 8,
    },
    {
      name: "transliterate command before the brace",
      source: "{y/a/b/}\n",
      character: 7,
    },
    {
      name: "nested block before the outer brace",
      source: "{{p;}}\n",
      character: 5,
    },
  ];

  for (const { name, source, character } of invalidBlocks) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        {
          code: "block-closing-brace-missing-separator",
          message: missingClosingSeparatorMessage,
          range: {
            start: { line: 0, character },
            end: { line: 0, character: character + 1 },
          },
        },
      ]);
    });
  }
});

test("distinguishes semicolon delimiters from command separators", async (t) => {
  for (const command of ["s", "y"]) {
    await t.test(`${command} command delimiter`, () => {
      assert.deepEqual(diagnosticsFor(`{${command};a;b;}\n`), [
        {
          code: "block-closing-brace-missing-separator",
          message: missingClosingSeparatorMessage,
          range: {
            start: { line: 0, character: 7 },
            end: { line: 0, character: 8 },
          },
        },
      ]);
    });

    await t.test(`${command} command separator`, () => {
      assert.deepEqual(diagnosticsFor(`{${command};a;b;;}\n`), []);
    });
  }
});

test("rejects trailing blanks after delimited commands inside a block", async (t) => {
  const invalidCommands = [
    {
      name: "substitute command before a newline",
      command: "s",
      source: "{\ns/a/b/ \n}\n",
      range: {
        start: { line: 1, character: 6 },
        end: { line: 1, character: 7 },
      },
    },
    {
      name: "transliterate command before a semicolon",
      command: "y",
      source: "{y/a/b/ ;}\n",
      range: {
        start: { line: 0, character: 7 },
        end: { line: 0, character: 8 },
      },
    },
  ];

  for (const { name, command, source, range } of invalidCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        {
          code: "command-unexpected-text",
          message: `Unexpected text after the POSIX sed \`${command}\` command.`,
          range,
        },
      ]);
    });
  }
});

test("rejects blanks after label-less branch commands inside a block", async (t) => {
  const invalidCommands = [
    {
      name: "branch command followed by a space",
      command: "b",
      source: "{\nb \n}\n",
      range: {
        start: { line: 1, character: 1 },
        end: { line: 1, character: 2 },
      },
    },
    {
      name: "test command followed by tabs",
      command: "t",
      source: "{\nt\t\t\n}\n",
      range: {
        start: { line: 1, character: 1 },
        end: { line: 1, character: 3 },
      },
    },
  ];

  for (const { name, command, source, range } of invalidCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        {
          code: "command-unexpected-text",
          message: `Unexpected text after the POSIX sed \`${command}\` command.`,
          range,
        },
      ]);
    });
  }
});

test("keeps unterminated delimited-command braces out of block recovery", async (t) => {
  const invalidCommands = [
    {
      name: "unterminated substitute pattern",
      source: "{s/foo}\n",
      code: "substitute-unterminated-pattern",
      message: "The POSIX sed substitute pattern is not terminated.",
    },
    {
      name: "unterminated transliterate second string",
      source: "{y/a/b}\n",
      code: "transliterate-unterminated-second-string",
      message:
        "The second string in this POSIX sed `y` command is not terminated.",
    },
  ];

  for (const { name, source, code, message } of invalidCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        {
          code,
          message,
          range: {
            start: { line: 0, character: 1 },
            end: { line: 0, character: 7 },
          },
        },
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
  }
});

test("preserves primary command errors while recovering at a closing brace", () => {
  assert.deepEqual(diagnosticsFor("{s/a/b/x}\n{y/a/b/x}\n"), [
    {
      code: "substitute-invalid-flag",
      message: "Invalid POSIX sed substitute flag: `x`.",
      range: {
        start: { line: 0, character: 7 },
        end: { line: 0, character: 8 },
      },
    },
    {
      code: "command-unexpected-text",
      message: "Unexpected text after the POSIX sed `y` command.",
      range: {
        start: { line: 1, character: 7 },
        end: { line: 1, character: 8 },
      },
    },
  ]);
});

test("keeps filename braces out of block recovery", () => {
  assert.deepEqual(diagnosticsFor("{\ns/a/b/w output; }\n"), [
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

test("tracks command boundaries after a multiline substitute replacement", () => {
  const invalidScript = "{\ns/a/first\\\nsecond/}\n";
  assert.deepEqual(diagnosticsFor(invalidScript), [
    {
      code: "block-closing-brace-missing-separator",
      message: missingClosingSeparatorMessage,
      range: {
        start: { line: 2, character: 7 },
        end: { line: 2, character: 8 },
      },
    },
  ]);

  const validScript = "{\ns/a/first\\\nsecond/;}\n";
  assert.deepEqual(diagnosticsFor(validScript), []);
});

test("reports address and closing-brace separator errors independently", () => {
  assert.deepEqual(diagnosticsFor("{1,2q}\n"), [
    {
      code: "address-too-many",
      message: "The POSIX sed `q` command accepts at most one address.",
      range: {
        start: { line: 0, character: 3 },
        end: { line: 0, character: 4 },
      },
    },
    {
      code: "block-closing-brace-missing-separator",
      message: missingClosingSeparatorMessage,
      range: {
        start: { line: 0, character: 5 },
        end: { line: 0, character: 6 },
      },
    },
  ]);
});

test("reports an extra closing brace as unmatched after a completed block", () => {
  assert.deepEqual(diagnosticsFor("{p;}}\n"), [
    {
      code: "block-unexpected-closing-brace",
      message: "This POSIX sed closing brace has no matching opening brace.",
      range: {
        start: { line: 0, character: 4 },
        end: { line: 0, character: 5 },
      },
    },
  ]);
});
