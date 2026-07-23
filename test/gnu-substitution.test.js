import assert from "node:assert/strict";
import test from "node:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { createDiagnostics } from "../src/diagnostics.js";
import {
  characterAt,
  createSubstituteFlagState,
  findReplacementCaseConversionEscapes,
  findReplacementDelimiter,
  scanSubstituteFlagTokenSyntax,
} from "../src/sed-syntax.js";

const posixBreProfile = Object.freeze({
  dialect: "posix",
  regexpMode: "bre",
});
const gnuBreProfile = Object.freeze({
  dialect: "gnu",
  regexpMode: "bre",
});

function diagnosticsFor(source, syntaxProfile = gnuBreProfile) {
  const document = TextDocument.create(
    "file:///gnu-substitution.sed",
    "sed",
    1,
    source,
  );
  return createDiagnostics(document, syntaxProfile).map(
    ({ code, message, range }) => ({ code, message, range }),
  );
}

function diagnostic(code, message, start, end) {
  return {
    code,
    message,
    range: {
      start: { line: 0, character: start },
      end: { line: 0, character: end },
    },
  };
}

function flagStateFor(source) {
  let cursor = 0;
  let state = createSubstituteFlagState();
  while (cursor < source.length) {
    if (source[cursor] === " " || source[cursor] === "\t") {
      cursor += 1;
      continue;
    }
    const token = scanSubstituteFlagTokenSyntax(
      source,
      cursor,
      source.length,
      state,
      gnuBreProfile,
    );
    assert.notEqual(token.kind, "invalid");
    state = token.state;
    cursor = token.endOffset;
  }
  return state;
}

test("accepts GNU substitute flags and optional blanks", async (t) => {
  const sources = [
    { name: "evaluate", source: "s/a/b/e\n" },
    { name: "uppercase ignore case", source: "s/a/b/I\n" },
    { name: "uppercase multiline", source: "s/a/b/M\n" },
    { name: "lowercase multiline", source: "s/a/b/m\n" },
    { name: "all GNU flags", source: "s/a/b/ g 2 I e p m \n" },
    { name: "repeatable flags", source: "s/a/b/eeiIImMm\n" },
  ];

  for (const { name, source } of sources) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), []);
    });
  }
});

test("keeps GNU-only substitute flags out of POSIX mode", async (t) => {
  for (const flag of ["e", "I", "M", "m"]) {
    await t.test(flag, () => {
      assert.deepEqual(diagnosticsFor(`s/a/b/${flag}\n`, posixBreProfile), [
        diagnostic(
          "substitute-invalid-flag",
          `Invalid POSIX sed substitute flag: \`${flag}\`.`,
          6,
          7,
        ),
      ]);
    });
  }
});

test("implements GNU occurrence-number and global-flag interaction", async (t) => {
  const sources = [
    { name: "number before global", source: "s/a/b/2g\n" },
    { name: "global before number", source: "s/a/b/g2\n" },
    { name: "leading zero", source: "s/a/b/01\n" },
    { name: "several leading zeroes", source: "s/a/b/0001\n" },
    {
      name: "large number remains syntax",
      source: `s/a/b/${"9".repeat(200)}g\n`,
    },
  ];

  for (const { name, source } of sources) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), []);
    });
  }

  assert.deepEqual(flagStateFor("2g"), {
    evaluation: false,
    global: true,
    occurrenceNumber: "2",
    printTiming: null,
  });
  assert.deepEqual(flagStateFor("g2"), {
    evaluation: false,
    global: true,
    occurrenceNumber: "2",
    printTiming: null,
  });
});

test("rejects zero and repeated GNU occurrence numbers", async (t) => {
  const cases = [
    {
      name: "one zero",
      source: "s/a/b/0\n",
      code: "substitute-occurrence-zero",
      message: "A GNU sed `s` command occurrence number must not be zero.",
      start: 6,
      end: 7,
    },
    {
      name: "several zeroes",
      source: "s/a/b/000\n",
      code: "substitute-occurrence-zero",
      message: "A GNU sed `s` command occurrence number must not be zero.",
      start: 6,
      end: 9,
    },
    {
      name: "number after print",
      source: "s/a/b/2p3\n",
      code: "substitute-occurrence-repeated",
      message:
        "A GNU sed `s` command accepts only one occurrence-number option.",
      start: 8,
      end: 9,
    },
    {
      name: "number after flags and blanks",
      source: "s/a/b/2 g 3\n",
      code: "substitute-occurrence-repeated",
      message:
        "A GNU sed `s` command accepts only one occurrence-number option.",
      start: 10,
      end: 11,
    },
  ];

  for (const { name, source, code, message, start, end } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        diagnostic(code, message, start, end),
      ]);
    });
  }
});

test("rejects repeated GNU global and print flags", async (t) => {
  const cases = [
    {
      name: "global",
      source: "s/a/b/gg\n",
      flag: "g",
      start: 7,
      end: 8,
    },
    {
      name: "print separated by evaluate",
      source: "s/a/b/p e p\n",
      flag: "p",
      start: 10,
      end: 11,
    },
  ];

  for (const { name, source, flag, start, end } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        diagnostic(
          "substitute-flag-repeated",
          `The GNU sed \`${flag}\` substitute flag may only be specified once.`,
          start,
          end,
        ),
      ]);
    });
  }
});

test("preserves the source ordering of GNU evaluate and print flags", () => {
  assert.equal(flagStateFor("ep").printTiming, "after-evaluation");
  assert.equal(flagStateFor("pe").printTiming, "before-evaluation");
  assert.equal(flagStateFor("epe").printTiming, "after-evaluation");
  assert.equal(flagStateFor("pee").printTiming, "before-evaluation");
});

test("rejects GNU regexp modifiers on an empty substitute regexp", async (t) => {
  const cases = [
    { name: "lowercase ignore case", source: "s//x/i\n", start: 5, end: 6 },
    { name: "uppercase ignore case", source: "s//x/I\n", start: 5, end: 6 },
    { name: "lowercase multiline", source: "s//x/m\n", start: 5, end: 6 },
    { name: "uppercase multiline", source: "s//x/M\n", start: 5, end: 6 },
    {
      name: "several modifiers with blanks",
      source: "s//x/ I M\n",
      start: 6,
      end: 9,
    },
  ];

  for (const { name, source, start, end } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), [
        diagnostic(
          "substitute-empty-regexp-modifiers",
          "GNU sed substitute regexp modifiers cannot be used with an empty regexp.",
          start,
          end,
        ),
      ]);
    });
  }

  assert.deepEqual(diagnosticsFor("s//x/e\n"), []);
});

test("keeps the GNU write filename opaque through its physical line", () => {
  assert.deepEqual(diagnosticsFor("s/a/b/w :fake;L#}\nL\n"), [
    {
      code: "command-unknown",
      message: "Unknown GNU sed command: `L`.",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 1 },
      },
    },
  ]);
});

test("rejects backslash-CRLF in a substitute replacement", async (t) => {
  const source = "s/a/b\\\r\n# rest\n";

  for (const [name, profile] of [
    ["GNU", gnuBreProfile],
    ["POSIX", posixBreProfile],
  ]) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, profile), [
        {
          code: "substitute-unterminated-replacement",
          message: `The ${name} sed substitute replacement is not terminated.`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 6 },
          },
        },
      ]);
    });
  }
});

test("rejects recursive escaping after a GNU replacement control escape", async (t) => {
  const invalidCases = [
    {
      name: "plain replacement",
      source: String.raw`s/a/\c\x/`,
      start: 4,
      end: 8,
    },
    {
      name: "bracket-like replacement text",
      source: String.raw`s/a/[\c\x]/`,
      start: 5,
      end: 9,
    },
  ];

  for (const { name, source, start, end } of invalidCases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${source}\n`), [
        diagnostic(
          "replacement-invalid-control-escape",
          "GNU sed does not allow recursive escaping after `\\c`.",
          start,
          end,
        ),
      ]);
    });
  }

  assert.deepEqual(diagnosticsFor(`${String.raw`s/a/\c\\x/`}\n`), []);
  assert.deepEqual(
    diagnosticsFor(`${String.raw`s/a/\c\x/`}\n`, posixBreProfile),
    [],
  );
});

test("recognizes GNU replacement case-conversion escapes in source order", () => {
  const source = String.raw`\Lx\l\Uu\u\E/`;
  const delimiter = characterAt(source, source.length - 1);

  assert.deepEqual(
    findReplacementCaseConversionEscapes(
      source,
      0,
      source.length - 1,
      delimiter,
      gnuBreProfile,
    ),
    [
      { startOffset: 0, endOffset: 2, value: "L" },
      { startOffset: 3, endOffset: 5, value: "l" },
      { startOffset: 5, endOffset: 7, value: "U" },
      { startOffset: 8, endOffset: 10, value: "u" },
      { startOffset: 10, endOffset: 12, value: "E" },
    ],
  );
  assert.deepEqual(
    findReplacementCaseConversionEscapes(
      source,
      0,
      source.length - 1,
      delimiter,
      posixBreProfile,
    ),
    [],
  );
});

test("does not treat an escaped replacement delimiter as a case escape", () => {
  const source = String.raw`\LL`;
  const delimiter = characterAt(source, source.length - 1);

  assert.deepEqual(
    findReplacementCaseConversionEscapes(
      source,
      0,
      source.length - 1,
      delimiter,
      gnuBreProfile,
    ),
    [],
  );
  assert.equal(
    findReplacementDelimiter(source, 0, delimiter, gnuBreProfile).closingOffset,
    source.length - 1,
  );
});
