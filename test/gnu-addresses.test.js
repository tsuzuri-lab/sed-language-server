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
const gnuEreProfile = Object.freeze({
  dialect: "gnu",
  regexpMode: "ere",
});

function diagnosticsFor(source, syntaxProfile) {
  const document = TextDocument.create(
    "file:///gnu-addresses.sed",
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

test("accepts GNU stepped line-number addresses", async (t) => {
  const sources = [
    { name: "ordinary step", source: "1~2p\n" },
    { name: "zero first line", source: "0~2p\n" },
    { name: "zero step", source: "50~0p\n" },
    { name: "leading zeroes", source: "000~002p\n" },
    { name: "blanks around the operator", source: "1 ~ 2p\n" },
    { name: "stepped second address", source: "1,2~3p\n" },
    { name: "zero stepped second address", source: "1,0~2p\n" },
  ];

  for (const { name, source } of sources) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
    });
  }
});

test("keeps GNU stepped line-number syntax out of POSIX mode", async (t) => {
  const cases = [
    { name: "one-digit first", source: "1~2p\n", operatorOffset: 1 },
    { name: "zero first", source: "0~2p\n", operatorOffset: 1 },
    { name: "two-digit first", source: "50~0p\n", operatorOffset: 2 },
  ];

  for (const { name, source, operatorOffset } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, posixBreProfile), [
        diagnostic(
          "command-unknown",
          "Unknown POSIX sed command: `~`.",
          operatorOffset,
          operatorOffset + 1,
        ),
      ]);
    });
  }
});

test("accepts GNU relative range addresses including zero", async (t) => {
  const sources = [
    { name: "line count", source: "1,+2p\n" },
    { name: "line count after regexp", source: "/start/,+2p\n" },
    { name: "next line-number multiple", source: "1,~4p\n" },
    { name: "multiple after regexp", source: "/start/,~4p\n" },
    { name: "zero line count", source: "1,+0p\n" },
    { name: "zero multiple", source: "1,~0p\n" },
    { name: "blanks around a line count", source: "1 , + 2p\n" },
  ];

  for (const { name, source } of sources) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
    });
  }
});

test("rejects GNU relative range syntax in POSIX mode", async (t) => {
  const cases = [
    {
      name: "line count",
      source: "1,+2p\n",
      command: "+",
      operatorOffset: 2,
    },
    {
      name: "next multiple",
      source: "1,~2p\n",
      command: "~",
      operatorOffset: 2,
    },
  ];

  for (const { name, source, command, operatorOffset } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, posixBreProfile), [
        diagnostic(
          "command-unknown",
          `Unknown POSIX sed command: \`${command}\`.`,
          operatorOffset,
          operatorOffset + 1,
        ),
      ]);
    });
  }
});

test("accepts only the documented first-address uses of GNU line zero", async (t) => {
  const validSources = [
    { name: "regexp range", source: "0,/stop/p\n" },
    { name: "modified regexp range", source: "0,/stop/Ip\n" },
    { name: "empty regexp range", source: "0,//p\n" },
    { name: "standalone read", source: "0r input.txt\n" },
    { name: "standalone read with blanks", source: "00 r input.txt\n" },
    { name: "positive numeric step", source: "000~2p\n" },
    { name: "zero step before read", source: "0~0r input.txt\n" },
    { name: "zero as the second address", source: "1,0p\n" },
  ];

  for (const { name, source } of validSources) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
    });
  }
});

test("reports GNU line zero in every other first-address context", async (t) => {
  const cases = [
    { name: "print", source: "0p\n", end: 1 },
    { name: "leading zeroes", source: "00p\n", end: 2 },
    { name: "negated read", source: "0!r input.txt\n", end: 1 },
    { name: "uppercase read", source: "0Rinput.txt\n", end: 1 },
    { name: "numeric range", source: "0,1p\n", end: 1 },
    { name: "last-line range", source: "0,$p\n", end: 1 },
    { name: "relative-count range", source: "0,+2p\n", end: 1 },
    { name: "relative-multiple range", source: "0,~2p\n", end: 1 },
    { name: "zero step", source: "0~0p\n", end: 3 },
  ];

  for (const { name, source, end } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), [
        diagnostic(
          "address-zero-invalid",
          "GNU sed line address 0 is not valid in this context.",
          0,
          end,
        ),
      ]);
    });
  }
});

test("does not invent POSIX errors for decimal line zero", () => {
  assert.deepEqual(diagnosticsFor("0p\n", posixBreProfile), []);
  assert.deepEqual(diagnosticsFor("0,/stop/p\n", posixBreProfile), []);
  assert.deepEqual(diagnosticsFor("0r input.txt\n", posixBreProfile), []);
});

test("treats an omitted GNU step as zero when a command follows", async (t) => {
  const sources = [
    { name: "line-number step", source: "1~p\n" },
    { name: "relative count", source: "1,+p\n" },
    { name: "relative multiple", source: "1,~p\n" },
    { name: "first relative count", source: "+p\n" },
    { name: "first relative multiple", source: "~p\n" },
    { name: "explicit first zero count", source: "+0p\n" },
    { name: "explicit first zero multiple", source: "~0p\n" },
  ];

  for (const { name, source } of sources) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
    });
  }
});

test("reports a missing command after an otherwise empty GNU step", async (t) => {
  const cases = [
    { name: "line-number step", source: "1~", start: 0, end: 2 },
    { name: "relative count", source: "1,+", start: 2, end: 3 },
    { name: "relative multiple", source: "1,~", start: 2, end: 3 },
  ];

  for (const { name, source, start, end } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), [
        diagnostic(
          "command-missing",
          "Expected a GNU sed command.",
          start,
          end,
        ),
      ]);
    });
  }
});

test("rejects a GNU relative address in the first position", async (t) => {
  for (const { name, source } of [
    { name: "line count", source: "+2p\n" },
    { name: "line-number multiple", source: "~2p\n" },
  ]) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), [
        diagnostic(
          "address-relative-first",
          "A GNU sed `+N` or `~N` address can only be the second address in a range.",
          0,
          2,
        ),
      ]);
    });
  }
});

test("rejects omitted GNU range addresses without changing POSIX behavior", async (t) => {
  const cases = [
    { name: "first address", source: ",1p\n", commaOffset: 0 },
    { name: "second address", source: "1,p\n", commaOffset: 1 },
    {
      name: "blank second address",
      source: "1, p\n",
      commaOffset: 1,
    },
  ];

  for (const { name, source, commaOffset } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), [
        diagnostic(
          "address-range-missing",
          "Expected an address after this comma in a GNU sed address range.",
          commaOffset,
          commaOffset + 1,
        ),
      ]);
      assert.deepEqual(diagnosticsFor(source, posixBreProfile), []);
    });
  }
});

test("accepts GNU regexp address modifiers in any order", async (t) => {
  const sources = [
    { name: "ignore case", source: "/foo/Ip\n" },
    { name: "multiline", source: "/foo/Mp\n" },
    { name: "both", source: "/foo/IMp\n" },
    { name: "reverse order", source: "/foo/MIp\n" },
    { name: "duplicates", source: "/foo/IIMMp\n" },
    { name: "blanks", source: "/foo/ I M p\n" },
    { name: "second range address", source: "1,/foo/IMp\n" },
    { name: "alternate delimiter", source: String.raw`\%foo%MIp` },
    { name: "backslash delimiter", source: String.raw`\\foo\Ip` },
  ];

  for (const { name, source } of sources) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
    });
  }
});

test("keeps GNU address syntax independent from the regexp mode", () => {
  assert.deepEqual(diagnosticsFor("0~2p\n", gnuEreProfile), []);
  assert.deepEqual(diagnosticsFor("/foo/IMp\n", gnuEreProfile), []);
  assert.deepEqual(diagnosticsFor("1,+2p\n", gnuEreProfile), []);
});

test("keeps GNU regexp modifiers out of POSIX mode", () => {
  assert.deepEqual(diagnosticsFor("/foo/Ip\n", posixBreProfile), [
    diagnostic("command-unknown", "Unknown POSIX sed command: `I`.", 5, 6),
  ]);
  assert.deepEqual(diagnosticsFor(String.raw`\\foo\Ip`, posixBreProfile), [
    diagnostic(
      "address-invalid-delimiter",
      "A POSIX sed context address cannot use a backslash or newline as its delimiter.",
      1,
      2,
    ),
  ]);
});

test("rejects GNU regexp modifiers on an empty regexp", async (t) => {
  const cases = [
    { name: "ignore case", source: "//Ip\n", start: 2, end: 3 },
    { name: "multiline", source: "//Mp\n", start: 2, end: 3 },
    { name: "both with blanks", source: "// I M p\n", start: 3, end: 6 },
    {
      name: "alternate delimiter",
      source: String.raw`\%%Ip`,
      start: 3,
      end: 4,
    },
  ];

  for (const { name, source, start, end } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), [
        diagnostic(
          "address-empty-regexp-modifiers",
          "GNU sed regexp modifiers cannot be used with an empty regexp.",
          start,
          end,
        ),
      ]);
    });
  }
});

test("recovers from GNU address errors only at real command boundaries", () => {
  assert.deepEqual(diagnosticsFor("0p;L\n", gnuBreProfile), [
    diagnostic(
      "address-zero-invalid",
      "GNU sed line address 0 is not valid in this context.",
      0,
      1,
    ),
    diagnostic("command-unknown", "Unknown GNU sed command: `L`.", 3, 4),
  ]);
  assert.deepEqual(diagnosticsFor("1,+;L\n", gnuBreProfile), [
    diagnostic(
      "address-too-many",
      "An empty GNU sed command does not accept addresses.",
      0,
      1,
    ),
    diagnostic("command-unknown", "Unknown GNU sed command: `L`.", 4, 5),
  ]);
  assert.deepEqual(diagnosticsFor("//I;L\n", gnuBreProfile), [
    diagnostic(
      "address-empty-regexp-modifiers",
      "GNU sed regexp modifiers cannot be used with an empty regexp.",
      2,
      3,
    ),
    diagnostic("command-unknown", "Unknown GNU sed command: `L`.", 4, 5),
  ]);
  assert.deepEqual(diagnosticsFor("0R};L\n", gnuBreProfile), [
    diagnostic(
      "address-zero-invalid",
      "GNU sed line address 0 is not valid in this context.",
      0,
      1,
    ),
  ]);
});

test("reports GNU address errors with UTF-16 and CRLF positions", () => {
  const source = "s/💣/x/;p\r\n// I M p\r\n";
  const diagnostics = diagnosticsFor(source, gnuBreProfile);

  assert.deepEqual(diagnostics, [
    {
      code: "address-empty-regexp-modifiers",
      message: "GNU sed regexp modifiers cannot be used with an empty regexp.",
      range: {
        start: { line: 1, character: 3 },
        end: { line: 1, character: 6 },
      },
    },
  ]);
});
