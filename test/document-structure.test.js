import assert from "node:assert/strict";
import test from "node:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  buildDocumentStructure,
  getDocumentStructure,
  invalidateDocumentStructureCache,
} from "../src/document-structure.js";

const cursorMarker = "¦";
const posixBre = { dialect: "posix", regexpMode: "bre" };
const posixEre = { dialect: "posix", regexpMode: "ere" };
const gnuBre = { dialect: "gnu", regexpMode: "bre" };
const gnuEre = { dialect: "gnu", regexpMode: "ere" };

function structureAtCursor(markedSource) {
  const offset = markedSource.indexOf(cursorMarker);
  assert.notEqual(offset, -1, "the source must contain a cursor marker");
  assert.equal(
    markedSource.indexOf(cursorMarker, offset + cursorMarker.length),
    -1,
    "the source must contain exactly one cursor marker",
  );

  const source =
    markedSource.slice(0, offset) +
    markedSource.slice(offset + cursorMarker.length);
  const structure = buildDocumentStructure(source);

  return {
    context: structure.contextAt(offset),
    structure,
  };
}

function contextAtCursor(markedSource) {
  return structureAtCursor(markedSource).context;
}

test("identifies command positions after addresses, separators, and nested blocks", async (t) => {
  const commandPositions = [
    {
      name: "empty document",
      source: "¦",
    },
    {
      name: "leading blanks",
      source: "  ¦p\n",
    },
    {
      name: "addresses and negation",
      source: "1,/x/!¦p\n",
    },
    {
      name: "same-line command separator",
      source: "p;  ¦q\n",
    },
    {
      name: "physical newline",
      source: "p\n¦q\n",
    },
    {
      name: "nested block",
      source: "{ { ¦p; }; q; }\n",
    },
    {
      name: "command after a nested block",
      source: "{ { p; }; ¦q; }\n",
    },
  ];

  for (const { name, source } of commandPositions) {
    await t.test(name, () => {
      assert.deepEqual(contextAtCursor(source), { kind: "command" });
    });
  }
});

test("identifies substitute flag positions at exact delimiter boundaries", async (t) => {
  const positions = [
    {
      name: "inside the replacement",
      source: "s/a/b¦/\n",
      expected: null,
    },
    {
      name: "immediately after the replacement delimiter",
      source: "s/a/b/¦\n",
      expected: { kind: "substitute-flag" },
    },
    {
      name: "between substitute flags",
      source: "s/a/b/g¦p\n",
      expected: { kind: "substitute-flag" },
    },
    {
      name: "inside a multi-digit occurrence number",
      source: "s/a/b/20¦47\n",
      expected: { kind: "substitute-flag" },
    },
    {
      name: "after substitute flags",
      source: "s/a/b/gp¦;q\n",
      expected: { kind: "substitute-flag" },
    },
    {
      name: "command after substitute flags",
      source: "s/a/b/g;¦q\n",
      expected: { kind: "command" },
    },
    {
      name: "before a write flag",
      source: "s/a/b/¦w file\n",
      expected: { kind: "substitute-flag" },
    },
    {
      name: "inside a write filename",
      source: "s/a/b/w ¦file\n",
      expected: null,
    },
    {
      name: "semicolon used as the substitute delimiter",
      source: "s;a;b;¦;p\n",
      expected: { kind: "substitute-flag" },
    },
    {
      name: "command after a semicolon-delimited substitute",
      source: "s;a;b;;¦p\n",
      expected: { kind: "command" },
    },
  ];

  for (const { name, source, expected } of positions) {
    await t.test(name, () => {
      assert.deepEqual(contextAtCursor(source), expected);
    });
  }
});

test("identifies branch label positions only after the required literal space", async (t) => {
  const positions = [
    {
      name: "empty branch label",
      source: "b ¦\n",
      expected: { kind: "branch-label", command: "b" },
    },
    {
      name: "inside a branch label",
      source: "b lo¦op\n",
      expected: { kind: "branch-label", command: "b" },
    },
    {
      name: "inside a test label",
      source: "t lo¦op\n",
      expected: { kind: "branch-label", command: "t" },
    },
    {
      name: "after additional leading blanks",
      source: "b \t ¦loop\n",
      expected: { kind: "branch-label", command: "b" },
    },
    {
      name: "after a semicolon in a physical-line label",
      source: "b loop;¦p\n",
      expected: { kind: "branch-label", command: "b" },
    },
    {
      name: "branch command without a label separator",
      source: "b¦\n",
      expected: null,
    },
    {
      name: "tab used instead of the required literal space",
      source: "b\t¦loop\n",
      expected: null,
    },
    {
      name: "label definition",
      source: ":lo¦op\n",
      expected: null,
    },
  ];

  for (const { name, source, expected } of positions) {
    await t.test(name, () => {
      assert.deepEqual(contextAtCursor(source), expected);
    });
  }
});

test("collects forward, backward, and duplicate labels in source order", () => {
  const source =
    "b forward\n" +
    ":backward\n" +
    "b backward\n" +
    ":forward\n" +
    ":forward\n" +
    "t forward\n";

  const structure = buildDocumentStructure(source);

  assert.deepEqual(structure.labelDefinitions, [
    {
      name: "backward",
      range: { startOffset: 11, endOffset: 19 },
    },
    {
      name: "forward",
      range: { startOffset: 32, endOffset: 39 },
    },
    {
      name: "forward",
      range: { startOffset: 41, endOffset: 48 },
    },
  ]);
  assert.deepEqual(structure.labelReferences, [
    {
      command: "b",
      name: "forward",
      range: { startOffset: 2, endOffset: 9 },
    },
    {
      command: "b",
      name: "backward",
      range: { startOffset: 22, endOffset: 30 },
    },
    {
      command: "t",
      name: "forward",
      range: { startOffset: 51, endOffset: 58 },
    },
  ]);
});

test("excludes leading label blanks and preserves trailing blanks exactly", () => {
  const source =
    ":loop\n" +
    ":   loop  \n" +
    "b loop\n" +
    "b   loop  \n" +
    ": \tspaced\n" +
    "t \t spaced\n";

  const structure = buildDocumentStructure(source);

  assert.deepEqual(structure.labelDefinitions, [
    {
      name: "loop",
      range: { startOffset: 1, endOffset: 5 },
    },
    {
      name: "loop  ",
      range: { startOffset: 10, endOffset: 16 },
    },
    {
      name: "spaced",
      range: { startOffset: 38, endOffset: 44 },
    },
  ]);
  assert.deepEqual(structure.labelReferences, [
    {
      command: "b",
      name: "loop",
      range: { startOffset: 19, endOffset: 23 },
    },
    {
      command: "b",
      name: "loop  ",
      range: { startOffset: 28, endOffset: 34 },
    },
    {
      command: "t",
      name: "spaced",
      range: { startOffset: 49, endOffset: 55 },
    },
  ]);
});

test("does not collect omitted, blank-only, or invalidly separated labels", () => {
  const structure = buildDocumentStructure(
    ":\n:   \nb\nt\nb   \nt \t \nb\tbad\nt\tbad\n",
  );

  assert.deepEqual(structure.labelDefinitions, []);
  assert.deepEqual(structure.labelReferences, []);
});

test("treats semicolons in labels as label text and other semicolons as separators", () => {
  const source = ":loop;p\nb loop;p\np;q\n";
  const structure = buildDocumentStructure(source);

  assert.deepEqual(structure.labelDefinitions, [
    {
      name: "loop;p",
      range: { startOffset: 1, endOffset: 7 },
    },
  ]);
  assert.deepEqual(structure.labelReferences, [
    {
      command: "b",
      name: "loop;p",
      range: { startOffset: 10, endOffset: 16 },
    },
  ]);

  assert.equal(contextAtCursor(":loop;¦p\n"), null);
  assert.deepEqual(contextAtCursor("b loop;¦p\n"), {
    kind: "branch-label",
    command: "b",
  });
  assert.deepEqual(contextAtCursor("p;¦q\n"), { kind: "command" });
});

test("collects labels across nested blocks without introducing block scope", () => {
  const source =
    "{\n" +
    "  b outer\n" +
    "  {\n" +
    "    :inner\n" +
    "    t inner\n" +
    "  }\n" +
    "  :outer\n" +
    "}\n";

  const structure = buildDocumentStructure(source);

  assert.deepEqual(structure.labelDefinitions, [
    {
      name: "inner",
      range: { startOffset: 21, endOffset: 26 },
    },
    {
      name: "outer",
      range: { startOffset: 46, endOffset: 51 },
    },
  ]);
  assert.deepEqual(structure.labelReferences, [
    {
      command: "b",
      name: "outer",
      range: { startOffset: 6, endOffset: 11 },
    },
    {
      command: "t",
      name: "inner",
      range: { startOffset: 33, endOffset: 38 },
    },
  ]);
});

test("keeps editor contexts and labels out of opaque command regions", async (t) => {
  const opaquePositions = [
    {
      name: "comment",
      source: "# :fake; b fake¦\np\n",
    },
    {
      name: "continued text argument",
      source: "a\\\ns/a/b/\\\n:fake¦\np\n",
    },
    {
      name: "read filename",
      source: "r file;:fake¦\n",
    },
    {
      name: "write filename",
      source: "w file;:fake¦\n",
    },
    {
      name: "substitute write filename",
      source: "s/a/b/w file;:fake¦\n",
    },
    {
      name: "context-address regular expression",
      source: "/:fake;b fake¦/p\n",
    },
    {
      name: "substitute pattern",
      source: "s/:fake;b fake¦/x/\n",
    },
    {
      name: "substitute replacement",
      source: "s/x/:fake;b fake¦/\n",
    },
    {
      name: "first transliterate string",
      source: "y/:fake¦/bfake/\n",
    },
    {
      name: "second transliterate string",
      source: "y/abc/:x¦#/\n",
    },
  ];

  for (const { name, source } of opaquePositions) {
    await t.test(name, () => {
      const { context, structure } = structureAtCursor(source);

      assert.equal(context, null);
      assert.deepEqual(structure.labelDefinitions, []);
      assert.deepEqual(structure.labelReferences, []);
    });
  }
});

test("tracks the replacement and following contexts across an escaped newline", () => {
  assert.equal(contextAtCursor("s/a/first\\\n¦second/g;p\n"), null);
  assert.deepEqual(contextAtCursor("s/a/first\\\nsecond/¦g;p\n"), {
    kind: "substitute-flag",
  });
  assert.deepEqual(contextAtCursor("s/a/first\\\nsecond/g¦;p\n"), {
    kind: "substitute-flag",
  });
  assert.deepEqual(contextAtCursor("s/a/first\\\nsecond/g;¦p\n"), {
    kind: "command",
  });
});

test("resumes command parsing after consecutive multiline replacements", () => {
  const firstResume =
    "s/a/first\\\n" + "second/g;¦s/b/third\\\n" + "fourth/g;p\n";
  const secondResume =
    "s/a/first\\\n" + "second/g;s/b/third\\\n" + "fourth/g;¦p\n";

  assert.deepEqual(contextAtCursor(firstResume), { kind: "command" });
  assert.deepEqual(contextAtCursor(secondResume), { kind: "command" });
});

test("continues editor parsing on the next line after malformed delimited commands", async (t) => {
  const commands = [
    {
      name: "unterminated first context address",
      source: "/foo\n¦p",
    },
    {
      name: "unterminated second context address",
      source: "1,/foo\n¦p",
    },
    {
      name: "substitute command without a delimiter",
      source: "s\n¦p",
    },
    {
      name: "substitute command with a backslash delimiter",
      source: "s\\\n¦p",
    },
    {
      name: "unterminated substitute pattern",
      source: "s/foo\n¦p",
    },
    {
      name: "unterminated substitute replacement",
      source: "s/a/b\n¦p",
    },
    {
      name: "unspecified escaped left-bracket delimiter",
      source: "s[\\[x[y[z\n¦p",
    },
    {
      name: "transliterate command without a delimiter",
      source: "y\n¦p",
    },
    {
      name: "transliterate command with a backslash delimiter",
      source: "y\\\n¦p",
    },
    {
      name: "unterminated first transliterate string",
      source: "y/foo\n¦p",
    },
    {
      name: "unterminated second transliterate string",
      source: "y/a/b\n¦p",
    },
  ];

  for (const { name, source } of commands) {
    await t.test(name, () => {
      assert.deepEqual(contextAtCursor(source), { kind: "command" });
    });
  }
});

test("recovers editor parsing at explicit same-line boundaries", async (t) => {
  const boundaries = [
    {
      name: "omitted second address before a semicolon",
      source: "1,;¦p",
    },
    {
      name: "unknown command before a semicolon",
      source: "z junk;¦p",
    },
    {
      name: "unknown command before a closing brace",
      source: "{z junk¦}",
    },
    {
      name: "invalid substitute flag before a semicolon",
      source: "{s/a/b/e;¦p;}",
    },
    {
      name: "substitute flags before a closing brace",
      source: "{s/a/b/¦}",
    },
    {
      name: "transliterate command before a semicolon",
      source: "{y/a/b/;¦p;}",
    },
    {
      name: "unexpected transliterate text before a closing brace",
      source: "{y/a/b/ junk¦}",
    },
  ];

  for (const { name, source } of boundaries) {
    await t.test(name, () => {
      assert.deepEqual(contextAtCursor(source), { kind: "command" });
    });
  }
});

test("reports structure ranges as raw UTF-16 offsets", () => {
  const source = "/😀/p;:loop\nb loop\n";
  const structure = buildDocumentStructure(source);

  assert.equal(source.length, 19);
  assert.deepEqual(structure.contextAt(4), { kind: "command" });
  assert.deepEqual(structure.contextAt(6), { kind: "command" });
  assert.deepEqual(structure.labelDefinitions, [
    {
      name: "loop",
      range: { startOffset: 7, endOffset: 11 },
    },
  ]);
  assert.deepEqual(structure.labelReferences, [
    {
      command: "b",
      name: "loop",
      range: { startOffset: 14, endOffset: 18 },
    },
  ]);
});

test("excludes CRLF line endings from label names and ranges", () => {
  const structure = buildDocumentStructure(":loop\r\nb loop\r\n");

  assert.deepEqual(structure.labelDefinitions, [
    {
      name: "loop",
      range: { startOffset: 1, endOffset: 5 },
    },
  ]);
  assert.deepEqual(structure.labelReferences, [
    {
      command: "b",
      name: "loop",
      range: { startOffset: 9, endOffset: 13 },
    },
  ]);
});

test("reports the full replacement range for a partially entered branch label", () => {
  const source = "b \t longer";
  const structure = buildDocumentStructure(source);

  assert.deepEqual(structure.contextDetailsAt(6), {
    kind: "branch-label",
    command: "b",
    range: { startOffset: 2, endOffset: 10 },
    replacementRange: { startOffset: 4, endOffset: 10 },
  });
});

test("does not expose substitute-flag context when invalid text remains", async (t) => {
  const positions = [
    {
      name: "blank in the flag field",
      source: "s/a/b/ ",
      offset: 7,
    },
    {
      name: "invalid text after the cursor",
      source: "s/a/b/ e",
      offset: 6,
    },
    {
      name: "invalid flag character at the cursor",
      source: "s/a/b/e",
      offset: 7,
    },
    {
      name: "zero at the beginning of an occurrence number",
      source: "s/a/b/0",
      offset: 7,
    },
    {
      name: "zero after a letter flag",
      source: "s/a/b/g0",
      offset: 8,
    },
  ];

  for (const { name, source, offset } of positions) {
    await t.test(name, () => {
      assert.equal(
        buildDocumentStructure(source).contextDetailsAt(offset),
        null,
      );
    });
  }
});

test("reuses a document structure until the document version changes", () => {
  const document = TextDocument.create("file:///cache.sed", "sed", 1, ":old\n");
  const first = getDocumentStructure(document);

  assert.equal(getDocumentStructure(document), first);

  TextDocument.update(document, [{ text: ":new\n" }], 2);
  const updated = getDocumentStructure(document);

  assert.notEqual(updated, first);
  assert.deepEqual(updated.labelDefinitions, [
    {
      name: "new",
      range: { startOffset: 1, endOffset: 4 },
    },
  ]);
});

test("caches document structures separately for each syntax profile", () => {
  const document = TextDocument.create(
    "file:///profile-cache.sed",
    "sed",
    1,
    "z\n",
  );

  const implicitPosix = getDocumentStructure(document);
  const explicitPosix = getDocumentStructure(document, posixBre);
  const gnu = getDocumentStructure(document, gnuBre);

  assert.equal(explicitPosix, implicitPosix);
  assert.equal(getDocumentStructure(document, { ...posixBre }), implicitPosix);
  assert.equal(getDocumentStructure(document, { ...gnuBre }), gnu);
  assert.notEqual(gnu, implicitPosix);

  invalidateDocumentStructureCache(document);

  assert.notEqual(getDocumentStructure(document, posixBre), implicitPosix);
  assert.notEqual(getDocumentStructure(document, gnuBre), gnu);
});

test("globally invalidates every document and syntax-profile cache entry", () => {
  const documents = [
    TextDocument.create("file:///first-cache.sed", "sed", 1, "z\n"),
    TextDocument.create("file:///second-cache.sed", "sed", 1, ":x;p\n"),
  ];
  const profiles = [posixBre, posixEre, gnuBre, gnuEre];
  const cachedStructures = documents.map((document) =>
    profiles.map((profile) => getDocumentStructure(document, profile)),
  );

  for (const [documentIndex, document] of documents.entries()) {
    for (const [profileIndex, profile] of profiles.entries()) {
      assert.equal(
        getDocumentStructure(document, { ...profile }),
        cachedStructures[documentIndex][profileIndex],
      );
    }
  }

  invalidateDocumentStructureCache();

  for (const [documentIndex, document] of documents.entries()) {
    for (const [profileIndex, profile] of profiles.entries()) {
      assert.notEqual(
        getDocumentStructure(document, profile),
        cachedStructures[documentIndex][profileIndex],
      );
    }
  }
});

test("returns no editor context for offsets outside the document", () => {
  const structure = buildDocumentStructure("p\n");
  const invalidOffsets = [-1, 0.5, 3];

  for (const offset of invalidOffsets) {
    assert.equal(structure.contextAt(offset), null);
    assert.equal(structure.contextDetailsAt(offset), null);
  }
});
