import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { TextDocument } from "vscode-languageserver-textdocument";
import { createDiagnostics } from "../src/diagnostics.js";
import { findRegexpTokens } from "../src/sed-syntax.js";

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

function diagnosticsFor(source, syntaxProfile = gnuBreProfile) {
  const document = TextDocument.create(
    "file:///gnu-regexp.sed",
    "sed",
    1,
    source,
  );
  return createDiagnostics(document, syntaxProfile).map(
    ({ code, message, range }) => ({ code, message, range }),
  );
}

function firstToken(source, syntaxProfile) {
  return findRegexpTokens(source, 0, source.length, null, syntaxProfile)[0];
}

function invalidBackReference(mode, start, end) {
  return {
    code: `${mode}-invalid-back-reference`,
    message: `The GNU ${mode.toUpperCase()} back-reference \`\\1\` does not refer to a preceding subexpression.`,
    range: {
      start: { line: 0, character: start },
      end: { line: 0, character: end },
    },
  };
}

function invalidControlEscape(start, end) {
  return {
    code: "regexp-invalid-control-escape",
    message: "GNU sed does not allow recursive escaping after `\\c`.",
    range: {
      start: { line: 0, character: start },
      end: { line: 0, character: end },
    },
  };
}

test("recognizes GNU BRE operators without changing POSIX tokens", async (t) => {
  for (const operator of ["+", "?", "|"]) {
    await t.test(`backslash ${operator}`, () => {
      const source = `\\${operator}`;
      assert.equal(firstToken(source, gnuBreProfile).kind, "operator");
      assert.equal(
        firstToken(source, posixBreProfile).kind,
        "escaped-character",
      );
    });
  }
});

test("recognizes GNU anchors and word-boundary escapes", async (t) => {
  const cases = [
    { source: String.raw`\``, kind: "anchor" },
    { source: String.raw`\'`, kind: "anchor" },
    { source: String.raw`\b`, kind: "word-boundary" },
    { source: String.raw`\B`, kind: "word-boundary" },
    { source: String.raw`\<`, kind: "word-boundary" },
    { source: String.raw`\>`, kind: "word-boundary" },
    { source: String.raw`\w`, kind: "word-boundary" },
    { source: String.raw`\W`, kind: "word-boundary" },
    { source: String.raw`\s`, kind: "word-boundary" },
    { source: String.raw`\S`, kind: "word-boundary" },
  ];

  for (const { source, kind } of cases) {
    await t.test(source, () => {
      assert.equal(firstToken(source, gnuBreProfile).kind, kind);
      assert.equal(
        firstToken(source, posixBreProfile).kind,
        "escaped-character",
      );
    });
  }
});

test("recognizes GNU character escape sequences with their source ranges", async (t) => {
  const sources = [
    String.raw`\a`,
    String.raw`\f`,
    String.raw`\n`,
    String.raw`\r`,
    String.raw`\t`,
    String.raw`\v`,
    String.raw`\cA`,
    String.raw`\d65`,
    String.raw`\o101`,
    String.raw`\x41`,
  ];

  for (const source of sources) {
    await t.test(source, () => {
      const token = firstToken(source, gnuBreProfile);
      assert.equal(token.kind, "character-escape");
      assert.equal(token.offset, 0);
      assert.equal(token.endOffset, source.length);
      assert.equal(token.origin, "character-escape");
    });
  }
});

test("uses GNU control escapes as atomic regexp boundary units", async (t) => {
  const sources = [
    { name: "address delimiter payload", source: String.raw`/\c//p` },
    { name: "substitute delimiter payload", source: String.raw`s/\c//x/` },
    { name: "left bracket payload", source: String.raw`/\c[/p` },
    { name: "physical newline payload", source: "/\\c\nX/p" },
  ];

  for (const { name, source } of sources) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${source}\n`), []);
    });
  }
});

test("rejects recursive escaping after a GNU regexp control escape", async (t) => {
  const invalidCases = [
    {
      name: "address",
      source: String.raw`/\c\a/p`,
      start: 1,
      end: 5,
    },
    {
      name: "bracket expression",
      source: String.raw`/[\c\a]/p`,
      start: 2,
      end: 6,
    },
    {
      name: "substitute pattern",
      source: String.raw`s/\c\a/x/`,
      start: 2,
      end: 6,
    },
  ];

  for (const { name, source, start, end } of invalidCases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${source}\n`), [
        invalidControlEscape(start, end),
      ]);
    });
  }

  for (const source of [
    String.raw`/\c\\a/p`,
    String.raw`/[\c\\a]/p`,
    String.raw`s/\c\\a/x/`,
  ]) {
    assert.deepEqual(diagnosticsFor(`${source}\n`), []);
  }
});

test("consumes both backslashes after a valid GNU control escape", () => {
  const source = String.raw`/\c\\(a\)\1/p`;
  assert.equal(
    diagnosticsFor(`${source}\n`)[0].code,
    "bre-invalid-back-reference",
  );
});

test("keeps a bracket open when its apparent close is a control payload", () => {
  assert.deepEqual(diagnosticsFor(`${String.raw`/[\c]/p`}\n`), [
    {
      code: "regexp-unclosed-bracket-expression",
      message: "The GNU sed regular expression has an unmatched `[`.",
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 5 },
      },
    },
  ]);
  assert.equal(
    diagnosticsFor(`${String.raw`s/[\c]/x/`}\n`)[0].code,
    "regexp-unclosed-bracket-expression",
  );
  assert.deepEqual(diagnosticsFor(`${String.raw`/[\c]]/p`}\n`), []);
});

test("uses raw bracket-element state for GNU regexp boundaries", async (t) => {
  assert.equal(
    diagnosticsFor("/[[:foo:[]x]/p\n")[0].code,
    "regexp-unclosed-bracket-expression",
  );

  const patterns = [
    String.raw`[[:foo\c::]x]`,
    String.raw`[[.a\c..]x]`,
    String.raw`[[=a\c==]x]`,
    "[[:foo::]x]",
  ];

  for (const pattern of patterns) {
    await t.test(`address: ${pattern}`, () => {
      assert.equal(
        diagnosticsFor(`/${pattern}/p\n`)[0].code,
        "address-unterminated-context",
      );
    });
    await t.test(`substitute: ${pattern}`, () => {
      assert.equal(
        diagnosticsFor(`s/${pattern}/z/\n`)[0].code,
        "substitute-unterminated-pattern",
      );
    });
  }
});

test("continues GNU address and substitute regexps across escaped LF", async (t) => {
  const sources = [
    { name: "slash address", source: "/foo\\\nbar/p\n" },
    { name: "alternate address", source: "\\#foo\\\nbar#p\n" },
    { name: "substitute pattern", source: "s/foo\\\nbar/x/\n" },
    {
      name: "several continued lines",
      source: "/one\\\ntwo\\\nthree/p\n",
    },
  ];

  for (const { name, source } of sources) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(source), []);
    });
  }
});

test("keeps continued command arguments opaque after a multiline address", async (t) => {
  for (const command of ["a", "c", "i", "e"]) {
    await t.test(`${command} command`, () => {
      const source = `/\\c\n\\c\nx/${command} text\\\nL\np\n`;
      assert.deepEqual(diagnosticsFor(source), []);
    });
  }
});

test("keeps escaped regexp newlines out of POSIX mode", () => {
  assert.equal(
    diagnosticsFor("/foo\\\nbar/p\n", posixBreProfile)[0].code,
    "address-unterminated-context",
  );
  assert.equal(
    diagnosticsFor("s/foo\\\nbar/x/\n", posixBreProfile)[0].code,
    "substitute-unterminated-pattern",
  );
});

test("rejects physical newlines that GNU does not treat as continuations", async (t) => {
  const cases = [
    { name: "unescaped address newline", source: "/foo\nbar/p\n" },
    { name: "escaped newline in bracket", source: "/[a\\\nb]/p\n" },
    { name: "backslash before CRLF", source: "/foo\\\r\nbar/p\n" },
    { name: "control escape before CRLF", source: "/\\c\r\nX/p\n" },
  ];

  for (const { name, source } of cases) {
    await t.test(name, () => {
      assert.equal(
        diagnosticsFor(source)[0].code,
        "address-unterminated-context",
      );
    });
  }
});

test("reports an unfinished GNU multiline pattern through end of input", () => {
  assert.deepEqual(diagnosticsFor("s/foo\\\nbar"), [
    {
      code: "substitute-unterminated-pattern",
      message: "The GNU sed substitute pattern is not terminated.",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 1, character: 3 },
      },
    },
  ]);
});

test("does not use POSIX undefined-bracket recovery in GNU mode", () => {
  assert.equal(
    diagnosticsFor("/[x/p\n")[0].code,
    "address-unterminated-context",
  );
  assert.equal(
    diagnosticsFor("s/[x/y/\n")[0].code,
    "substitute-unterminated-pattern",
  );

  assert.deepEqual(diagnosticsFor("/[x/p\n", posixBreProfile), []);
  assert.deepEqual(diagnosticsFor("s/[x/y/\n", posixBreProfile), []);
});

test("validates direct GNU BRE back-references", () => {
  assert.deepEqual(diagnosticsFor(`${String.raw`/\(a\)\1/p`}\n`), []);
  assert.deepEqual(diagnosticsFor(`${String.raw`/\1\(a\)/p`}\n`), [
    invalidBackReference("bre", 1, 3),
  ]);
  assert.deepEqual(diagnosticsFor(`${String.raw`/\(a\1\)/p`}\n`), [
    invalidBackReference("bre", 4, 6),
  ]);
});

test("validates direct GNU ERE back-references", () => {
  assert.deepEqual(
    diagnosticsFor(`${String.raw`/(a)\1/p`}\n`, gnuEreProfile),
    [],
  );
  assert.deepEqual(diagnosticsFor(`${String.raw`/\1(a)/p`}\n`, gnuEreProfile), [
    invalidBackReference("ere", 1, 3),
  ]);
  assert.deepEqual(diagnosticsFor(`${String.raw`/(a\1)/p`}\n`, gnuEreProfile), [
    invalidBackReference("ere", 3, 5),
  ]);
  assert.deepEqual(
    diagnosticsFor(`${String.raw`/\(a\)\1/p`}\n`, gnuEreProfile),
    [invalidBackReference("ere", 6, 8)],
  );
});

test("validates GNU back-references after character-escape normalization", async (t) => {
  const validCases = [
    {
      name: "BRE groups generated from backslashes",
      source: String.raw`/\x5c(a\x5c)\1/p`,
      profile: gnuBreProfile,
    },
    {
      name: "ERE groups generated from parentheses",
      source: String.raw`/\x28a\x29\1/p`,
      profile: gnuEreProfile,
    },
    {
      name: "ERE groups generated from wrapped decimal bytes",
      source: String.raw`/\d296a\d297\1/p`,
      profile: gnuEreProfile,
    },
    {
      name: "back-reference inside generated brackets",
      source: String.raw`/\x5ba\1\x5d/p`,
      profile: gnuBreProfile,
    },
    {
      name: "control escape keeps a logical bracket open",
      source: String.raw`/[a\c]\1]/p`,
      profile: gnuBreProfile,
    },
    {
      name: "digit used as the substitute delimiter",
      source: String.raw`s1\11x1`,
      profile: gnuBreProfile,
    },
  ];

  for (const { name, source, profile } of validCases) {
    await t.test(name, () => {
      assert.deepEqual(diagnosticsFor(`${source}\n`, profile), []);
    });
  }

  assert.deepEqual(diagnosticsFor(`${String.raw`/\x5c1/p`}\n`), [
    invalidBackReference("bre", 1, 6),
  ]);
  assert.deepEqual(diagnosticsFor(`${String.raw`/\d3481/p`}\n`), [
    invalidBackReference("bre", 1, 7),
  ]);
  assert.deepEqual(diagnosticsFor(`${String.raw`/[a\x5d\1]/p`}\n`), [
    invalidBackReference("bre", 7, 9),
  ]);
  assert.deepEqual(
    diagnosticsFor(`${String.raw`/\x5c(a\x5c)\1/p`}\n`, gnuEreProfile),
    [invalidBackReference("ere", 12, 14)],
  );
});

test("normalizes GNU escapes inside bracket-element markers", async (t) => {
  const backReferenceCases = [
    String.raw`/[[:digit\x3a]foo:]\1]/p`,
    String.raw`/[[:digit\d58]foo:]\1]/p`,
    String.raw`/[[.a\x2e]foo.]\1]/p`,
    String.raw`/[[=a\x3d]foo=]\1]/p`,
  ];

  for (const source of backReferenceCases) {
    for (const profile of [gnuBreProfile, gnuEreProfile]) {
      await t.test(`${profile.regexpMode}: ${source}`, () => {
        const start = source.indexOf(String.raw`\1`);
        assert.deepEqual(diagnosticsFor(`${source}\n`, profile), [
          invalidBackReference(profile.regexpMode, start, start + 2),
        ]);
      });
    }
  }

  for (const source of [
    String.raw`/[[:digit\c\a:]]/p`,
    String.raw`/[[.a\c\a.]]/p`,
    String.raw`/[[=a\c\a=]]/p`,
  ]) {
    const start = source.indexOf(String.raw`\c`);
    assert.deepEqual(diagnosticsFor(`${source}\n`), [
      invalidControlEscape(start, start + 4),
    ]);
  }
});

test("keeps generated bracket-element content distinct from its closing marker", async (t) => {
  const patterns = [
    String.raw`[[.\x2e.]]`,
    String.raw`[[.\d46.]]`,
    String.raw`[[=\x3d=]]`,
    String.raw`[[=\d61=]]`,
  ];

  for (const pattern of patterns) {
    for (const profile of [gnuBreProfile, gnuEreProfile]) {
      await t.test(`${profile.regexpMode} address: ${pattern}`, () => {
        assert.deepEqual(diagnosticsFor(`/${pattern}/p\n`, profile), []);
      });
      await t.test(`${profile.regexpMode} substitute: ${pattern}`, () => {
        assert.deepEqual(diagnosticsFor(`s/${pattern}/x/\n`, profile), []);
      });
    }
  }
});

test("reports multiline GNU ERE ranges with UTF-16 positions", () => {
  const source = "/😀\\\n\\1(a)/p\n";
  assert.deepEqual(diagnosticsFor(source, gnuEreProfile), [
    {
      code: "ere-invalid-back-reference",
      message:
        "The GNU ERE back-reference `\\1` does not refer to a preceding subexpression.",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 2 },
      },
    },
  ]);
});

test("scans long GNU regexps with escaped newlines in linear time", () => {
  const source = `/${"a\\\n".repeat(10_000)}z/p\n`;
  const startedAt = performance.now();

  assert.deepEqual(diagnosticsFor(source), []);
  const elapsedMilliseconds = performance.now() - startedAt;
  assert.ok(
    elapsedMilliseconds < 1_000,
    `expected a linear scan under 1000 ms, received ${elapsedMilliseconds.toFixed(1)} ms`,
  );
});

test("keeps large regexp and replacement diagnostics within a bounded heap", () => {
  const probe = `
    import { TextDocument } from "vscode-languageserver-textdocument";
    import { createDiagnostics } from "./src/diagnostics.js";

    const backslash = String.fromCharCode(92);
    const profiles = {
      gnu: { dialect: "gnu", regexpMode: "bre" },
      posix: { dialect: "posix", regexpMode: "bre" },
    };
    function run(name, source, profile) {
      const document = TextDocument.create(
        "file:///" + name + ".sed",
        "sed",
        1,
        source,
      );
      const diagnostics = createDiagnostics(document, profile);
      if (diagnostics.length !== 0) {
        throw new Error(name + ": " + JSON.stringify(diagnostics));
      }
      global.gc();
    }

    run("gnu-plain", "/" + "a".repeat(2_000_000) + "/p\\n", profiles.gnu);
    run("posix-plain", "/" + "a".repeat(2_000_000) + "/p\\n", profiles.posix);
    run(
      "gnu-operators",
      "/" + (backslash + "+").repeat(500_000) + "/p\\n",
      profiles.gnu,
    );
    run(
      "gnu-replacement",
      "s/a/" + (backslash + "L").repeat(3_000_000) + "/\\n",
      profiles.gnu,
    );
  `;
  const result = spawnSync(
    process.execPath,
    [
      "--max-old-space-size=64",
      "--expose-gc",
      "--input-type=module",
      "--eval",
      probe,
    ],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
      timeout: 30_000,
    },
  );

  assert.equal(
    result.status,
    0,
    result.stderr || result.error?.message || `child exited ${result.status}`,
  );
});
