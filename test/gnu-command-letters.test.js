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
  const document = TextDocument.create(
    "file:///gnu-command-letters.sed",
    "sed",
    1,
    source,
  );
  return createDiagnostics(document, syntaxProfile).map(
    ({ code, message, range }) => ({ code, message, range }),
  );
}

test("accepts every phase 8 command only in GNU mode", async (t) => {
  const cases = [
    { name: "execute", command: "e", source: "e\n" },
    { name: "input filename", command: "F", source: "F\n" },
    { name: "silent quit", command: "Q", source: "Q42\n" },
    { name: "read next line", command: "R", source: "Rinput.txt\n" },
    { name: "failed-substitution branch", command: "T", source: "T\n" },
    { name: "version requirement", command: "v", source: "v4.10\n" },
    { name: "write first line", command: "W", source: "Woutput.txt\n" },
    { name: "clear pattern space", command: "z", source: "z\n" },
  ];

  for (const { name, command, source } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
      assert.deepEqual(diagnosticsFor(source, posixBreProfile), [
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

test("applies GNU address limits to every phase 8 command", async (t) => {
  const twoAddressCommands = [
    { name: "execute", source: "1,2e\n" },
    { name: "input filename", source: "1,2F\n" },
    { name: "read next line", source: "1,2Rinput.txt\n" },
    { name: "failed-substitution branch", source: "1,2T\n" },
    { name: "version requirement", source: "1,2v4.10\n" },
    { name: "write first line", source: "1,2Woutput.txt\n" },
    { name: "clear pattern space", source: "1,2z\n" },
  ];

  for (const { name, source } of twoAddressCommands) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
    });
  }

  assert.deepEqual(diagnosticsFor("1Q255\n", gnuBreProfile), []);
  assert.deepEqual(diagnosticsFor("1,2Q\n", gnuBreProfile), [
    {
      code: "address-too-many",
      message: "The GNU sed `Q` command accepts at most one address.",
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 3 },
      },
    },
  ]);
});

test("keeps standalone GNU shell text opaque without executing it", () => {
  assert.deepEqual(
    diagnosticsFor("e printf text; } # shell syntax\n", gnuBreProfile),
    [],
  );
  assert.deepEqual(diagnosticsFor("e;z\n", gnuBreProfile), []);
  assert.deepEqual(diagnosticsFor("e#comment\n", gnuBreProfile), []);
  assert.deepEqual(diagnosticsFor("e}\n", gnuBreProfile), []);
});

test("keeps escaped-newline GNU shell text opaque and resumes afterwards", () => {
  const source = "e first\\\ns/foo\\\nstill shell\ns/foo\n";

  assert.deepEqual(diagnosticsFor(source, gnuBreProfile), [
    {
      code: "substitute-unterminated-pattern",
      message: "The GNU sed substitute pattern is not terminated.",
      range: {
        start: { line: 3, character: 0 },
        end: { line: 3, character: 5 },
      },
    },
  ]);
});

test("supports the leading-backslash form of the GNU shell command", () => {
  const source = "e\\\ns/foo\ns/foo\n";

  assert.deepEqual(diagnosticsFor(source, gnuBreProfile), [
    {
      code: "substitute-unterminated-pattern",
      message: "The GNU sed substitute pattern is not terminated.",
      range: {
        start: { line: 2, character: 0 },
        end: { line: 2, character: 5 },
      },
    },
  ]);
  assert.deepEqual(diagnosticsFor("e\\", gnuBreProfile), []);
});

test("treats GNU R and W filenames as opaque physical-line arguments", async (t) => {
  const cases = [
    {
      name: "read next line",
      source: "Rinput; } # filename\n",
    },
    {
      name: "write first line",
      source: "Woutput; } # filename\n",
    },
  ];

  for (const { name, source } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
    });
  }
});

test("does not close blocks with braces inside GNU shell text or filenames", async (t) => {
  for (const source of ["{e}\n", "{Rinput}\n", "{Woutput}\n"]) {
    await t.test(source.trimEnd(), () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), [
        {
          code: "block-unclosed-opening-brace",
          message: "This GNU sed opening brace is not closed.",
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ]);
    });
  }
});

test("reports missing GNU R and W filenames with the shared file diagnostics", () => {
  assert.deepEqual(diagnosticsFor("R\n", gnuBreProfile), [
    {
      code: "read-file-missing-name",
      message: "Expected a filename after the GNU sed `R` command.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
  ]);
  assert.deepEqual(diagnosticsFor("W   \n", gnuBreProfile), [
    {
      code: "write-file-missing-name",
      message: "Expected a filename after the GNU sed `W` command.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
  ]);
});

test("parses optional GNU Q exit statuses as unsigned decimal strings", () => {
  assert.deepEqual(diagnosticsFor("Q\nQ0\nQ 42;p\n", gnuBreProfile), []);
  assert.deepEqual(diagnosticsFor(`Q${"9".repeat(256)}\n`, gnuBreProfile), []);
});

test("reports text outside a GNU Q exit status and recovers at semicolons", async (t) => {
  const cases = [
    {
      name: "negative status",
      source: "Q-1;p\n",
      start: 1,
      end: 3,
    },
    {
      name: "explicit positive sign",
      source: "Q+1;p\n",
      start: 1,
      end: 3,
    },
    {
      name: "text after digits",
      source: "Q12x;p\n",
      start: 3,
      end: 4,
    },
  ];

  for (const { name, source, start, end } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), [
        {
          code: "command-unexpected-text",
          message: "Unexpected text after the GNU sed `Q` command.",
          range: {
            start: { line: 0, character: start },
            end: { line: 0, character: end },
          },
        },
      ]);
    });
  }
});

test("accepts GNU command endings after F, Q, and z", () => {
  const source = "{F}\n{Q42}\n{z}\nF#comment\nz;p\n";

  assert.deepEqual(diagnosticsFor(source, gnuBreProfile), []);
});

test("uses ordinary GNU boundaries for F and z and recovers after errors", async (t) => {
  const cases = [
    {
      name: "input filename command",
      source: "Fextra;s/foo\n",
      command: "F",
      unexpectedEnd: 6,
      substituteStart: 7,
      substituteEnd: 12,
    },
    {
      name: "clear command",
      source: "z1;s/foo\n",
      command: "z",
      unexpectedEnd: 2,
      substituteStart: 3,
      substituteEnd: 8,
    },
  ];

  for (const {
    name,
    source,
    command,
    unexpectedEnd,
    substituteStart,
    substituteEnd,
  } of cases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source, gnuBreProfile), [
        {
          code: "command-unexpected-text",
          message: `Unexpected text after the GNU sed \`${command}\` command.`,
          range: {
            start: { line: 0, character: 1 },
            end: { line: 0, character: unexpectedEnd },
          },
        },
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

test("uses GNU label boundaries for T and continues with later commands", () => {
  assert.deepEqual(
    diagnosticsFor(
      ":target\nTtarget;p\nT target p\n{Ttarget}\nT#comment\nT;p\n",
      gnuBreProfile,
    ),
    [],
  );
});

test("accepts GNU version requirements satisfied by the 4.10 target", () => {
  const versions = ["", "4", "4.0", "4.9", "4.10", "4.010", "4..1", "-1"];

  for (const version of versions) {
    assert.deepEqual(
      diagnosticsFor(`v${version}\n`, gnuBreProfile),
      [],
      version,
    );
  }
});

test("reports GNU version requirements newer than the 4.10 target", async (t) => {
  for (const version of ["4.10.0", "4.11", "5", "banana"]) {
    await t.test(version, () => {
      assert.deepEqual(diagnosticsFor(`v${version}\n`, gnuBreProfile), [
        {
          code: "version-requires-newer-sed",
          message: `The GNU sed 4.10 target does not satisfy the required version \`${version}\`.`,
          range: {
            start: { line: 0, character: 1 },
            end: { line: 0, character: version.length + 1 },
          },
        },
      ]);
    });
  }
});

test("continues diagnostics after an unsupported GNU version", () => {
  assert.deepEqual(diagnosticsFor("v4.11;s/foo\n", gnuBreProfile), [
    {
      code: "version-requires-newer-sed",
      message:
        "The GNU sed 4.10 target does not satisfy the required version `4.11`.",
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 5 },
      },
    },
    {
      code: "substitute-unterminated-pattern",
      message: "The GNU sed substitute pattern is not terminated.",
      range: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 11 },
      },
    },
  ]);
});

test("uses GNU token boundaries after version requirements", () => {
  assert.deepEqual(
    diagnosticsFor("v4;z\n{v4.10}\nv#comment\nv4 z\n", gnuBreProfile),
    [],
  );
});
