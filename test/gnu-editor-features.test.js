import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import {
  CompletionItemKind,
  InsertTextFormat,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { createCompletions } from "../src/completion.js";
import { createDefinitionLocations } from "../src/definition.js";
import {
  buildDocumentStructure,
  getDocumentStructure,
} from "../src/document-structure.js";

const cursorMarker = "¦";
const documentUri = "file:///gnu-editor-features.sed";
const posixBre = Object.freeze({ dialect: "posix", regexpMode: "bre" });
const gnuBre = Object.freeze({ dialect: "gnu", regexpMode: "bre" });

const posixCommandLabels = [
  ";",
  ":",
  "#",
  "}",
  "=",
  "a",
  "i",
  "q",
  "r",
  "{",
  "b",
  "c",
  "d",
  "D",
  "g",
  "G",
  "h",
  "H",
  "l",
  "n",
  "N",
  "p",
  "P",
  "s",
  "t",
  "w",
  "x",
  "y",
];
const gnuCommandLabels = [
  ...posixCommandLabels,
  "e",
  "F",
  "Q",
  "R",
  "T",
  "v",
  "W",
  "z",
];

function parseMarkedSource(markedSource) {
  const offset = markedSource.indexOf(cursorMarker);
  assert.notEqual(offset, -1, "the source must contain a cursor marker");
  assert.equal(
    markedSource.indexOf(cursorMarker, offset + cursorMarker.length),
    -1,
    "the source must contain exactly one cursor marker",
  );

  return {
    offset,
    source:
      markedSource.slice(0, offset) +
      markedSource.slice(offset + cursorMarker.length),
  };
}

function createDocument(source) {
  return TextDocument.create(documentUri, "sed", 1, source);
}

function completionsAt(markedSource, syntaxProfile) {
  const { offset, source } = parseMarkedSource(markedSource);
  const document = createDocument(source);
  return createCompletions(
    document,
    document.positionAt(offset),
    syntaxProfile,
  );
}

function completionLabelsAt(markedSource, syntaxProfile) {
  return completionsAt(markedSource, syntaxProfile).map(({ label }) => label);
}

function definitionsAt(markedSource, syntaxProfile) {
  const { offset, source } = parseMarkedSource(markedSource);
  const document = createDocument(source);
  return createDefinitionLocations(
    document,
    document.positionAt(offset),
    syntaxProfile,
  );
}

function labelCompletion(label, start, end) {
  return {
    label,
    kind: CompletionItemKind.Reference,
    insertTextFormat: InsertTextFormat.PlainText,
    documentation: "Branch label defined in this document.",
    textEdit: {
      range: { start, end },
      newText: label,
    },
  };
}

function definitionLocation(start, end) {
  return {
    uri: documentUri,
    range: { start, end },
  };
}

test("GNU labels end at semicolons and parsing continues on the same line", () => {
  const source = ":loop;b loop;p";
  const structure = buildDocumentStructure(source, gnuBre);

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
      range: { startOffset: 8, endOffset: 12 },
    },
  ]);
  assert.deepEqual(structure.contextAt(6), { kind: "command" });
  assert.deepEqual(structure.contextAt(13), { kind: "command" });

  const posixStructure = buildDocumentStructure(source, posixBre);
  assert.deepEqual(posixStructure.labelDefinitions, [
    {
      name: "loop;b loop;p",
      range: { startOffset: 1, endOffset: 14 },
    },
  ]);
  assert.deepEqual(posixStructure.labelReferences, []);
  assert.equal(posixStructure.contextAt(6), null);
  assert.equal(posixStructure.contextAt(13), null);
});

test("GNU labels end at a blank before the next command", () => {
  const source = ":loop b loop p";
  const structure = buildDocumentStructure(source, gnuBre);

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
      range: { startOffset: 8, endOffset: 12 },
    },
  ]);
  assert.deepEqual(structure.contextAt(6), { kind: "command" });
  assert.deepEqual(structure.contextAt(13), { kind: "command" });

  const posixStructure = buildDocumentStructure(source, posixBre);
  assert.deepEqual(posixStructure.labelDefinitions, [
    {
      name: "loop b loop p",
      range: { startOffset: 1, endOffset: 14 },
    },
  ]);
  assert.deepEqual(posixStructure.labelReferences, []);
});

test("GNU labels end before comments without parsing comment text", () => {
  const source = ":loop# ignored\nbloop# ignored";
  const structure = buildDocumentStructure(source, gnuBre);

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
      range: { startOffset: 16, endOffset: 20 },
    },
  ]);

  const posixStructure = buildDocumentStructure(source, posixBre);
  assert.deepEqual(posixStructure.labelDefinitions, [
    {
      name: "loop# ignored",
      range: { startOffset: 1, endOffset: 14 },
    },
  ]);
  assert.deepEqual(posixStructure.labelReferences, []);
});

test("GNU labels end before a closing brace and allow the brace to close its block", () => {
  const source = "{:loop}\n{bloop}";
  const structure = buildDocumentStructure(source, gnuBre);

  assert.deepEqual(structure.labelDefinitions, [
    {
      name: "loop",
      range: { startOffset: 2, endOffset: 6 },
    },
  ]);
  assert.deepEqual(structure.labelReferences, [
    {
      command: "b",
      name: "loop",
      range: { startOffset: 10, endOffset: 14 },
    },
  ]);
  assert.deepEqual(structure.contextAt(6), { kind: "command" });
  assert.deepEqual(structure.contextAt(14), { kind: "command" });

  const posixStructure = buildDocumentStructure(source, posixBre);
  assert.deepEqual(posixStructure.labelDefinitions, [
    {
      name: "loop}",
      range: { startOffset: 2, endOffset: 7 },
    },
  ]);
  assert.deepEqual(posixStructure.labelReferences, []);
});

test("GNU label names and ranges exclude syntactic leading and trailing blanks", () => {
  const source = ": \tloop \t;b\tloop \t;p";
  const structure = buildDocumentStructure(source, gnuBre);

  assert.deepEqual(structure.labelDefinitions, [
    {
      name: "loop",
      range: { startOffset: 3, endOffset: 7 },
    },
  ]);
  assert.deepEqual(structure.labelReferences, [
    {
      command: "b",
      name: "loop",
      range: { startOffset: 12, endOffset: 16 },
    },
  ]);
  assert.deepEqual(structure.contextDetailsAt(14), {
    kind: "branch-label",
    command: "b",
    range: { startOffset: 11, endOffset: 18 },
    replacementRange: { startOffset: 12, endOffset: 16 },
  });
  assert.deepEqual(structure.contextAt(10), { kind: "command" });
  assert.deepEqual(structure.contextAt(19), { kind: "command" });

  const posixStructure = buildDocumentStructure(source, posixBre);
  assert.deepEqual(posixStructure.labelDefinitions, [
    {
      name: "loop \t;b\tloop \t;p",
      range: { startOffset: 3, endOffset: 20 },
    },
  ]);
  assert.deepEqual(posixStructure.labelReferences, []);
});

test("GNU completion treats commands after label terminators as new commands", async (t) => {
  const boundaries = [
    {
      name: "semicolon terminator",
      source: ":loop;p\nb loop;¦",
      posixLabel: "loop;p",
    },
    {
      name: "blank terminator",
      source: ":loop p\nb loop ¦p",
      posixLabel: "loop p",
    },
  ];

  for (const { name, source, posixLabel } of boundaries) {
    await t.test(name, () => {
      assert.deepEqual(completionLabelsAt(source, gnuBre), gnuCommandLabels);
      assert.deepEqual(completionLabelsAt(source, posixBre), [posixLabel]);
    });
  }
});

test("GNU label boundaries agree across completion and go to definition", async (t) => {
  const cases = [
    {
      name: "semicolon",
      source: ":target;b tar¦get",
      definitionStart: { line: 0, character: 1 },
      definitionEnd: { line: 0, character: 7 },
    },
    {
      name: "blank",
      source: ":target p\nb tar¦get p",
      definitionStart: { line: 0, character: 1 },
      definitionEnd: { line: 0, character: 7 },
    },
    {
      name: "comment marker",
      source: ":target# definition\nb tar¦get# reference",
      definitionStart: { line: 0, character: 1 },
      definitionEnd: { line: 0, character: 7 },
    },
    {
      name: "closing brace",
      source: "{:target}\n{b tar¦get}",
      definitionStart: { line: 0, character: 2 },
      definitionEnd: { line: 0, character: 8 },
    },
  ];

  for (const { name, source, definitionStart, definitionEnd } of cases) {
    await t.test(name, () => {
      assert.deepEqual(completionLabelsAt(source, gnuBre), ["target"]);
      assert.deepEqual(definitionsAt(source, gnuBre), [
        definitionLocation(definitionStart, definitionEnd),
      ]);
    });
  }
});

test("GNU branch-label completion accepts an omitted separator and a tab", async (t) => {
  const positions = [
    {
      name: "label immediately after b",
      source: ":target\nbta¦rget",
      start: { line: 1, character: 1 },
      end: { line: 1, character: 7 },
    },
    {
      name: "label after a tab",
      source: ":target\nb\tta¦rget",
      start: { line: 1, character: 2 },
      end: { line: 1, character: 8 },
    },
  ];

  for (const { name, source, start, end } of positions) {
    await t.test(name, () => {
      assert.deepEqual(completionsAt(source, gnuBre), [
        labelCompletion("target", start, end),
      ]);
      assert.deepEqual(completionsAt(source, posixBre), []);
    });
  }
});

test("GNU go to definition matches normalized labels and returns the trimmed source range", () => {
  const source = ": \tloop \t;b\tlo¦op \t;p";

  assert.deepEqual(completionsAt(source, gnuBre), [
    labelCompletion(
      "loop",
      { line: 0, character: 12 },
      { line: 0, character: 16 },
    ),
  ]);
  assert.deepEqual(definitionsAt(source, gnuBre), [
    definitionLocation({ line: 0, character: 3 }, { line: 0, character: 7 }),
  ]);
  assert.deepEqual(definitionsAt(source, posixBre), []);
});

test("GNU definition returns every normalized matching label range", () => {
  const source = ": loop ;:loop;b lo¦op";

  assert.deepEqual(completionLabelsAt(source, gnuBre), ["loop"]);
  assert.deepEqual(definitionsAt(source, gnuBre), [
    definitionLocation({ line: 0, character: 2 }, { line: 0, character: 6 }),
    definitionLocation({ line: 0, character: 9 }, { line: 0, character: 13 }),
  ]);
});

test("GNU go to definition resolves labels without a branch separator", () => {
  const source = ":loop;blo¦op";

  assert.deepEqual(definitionsAt(source, gnuBre), [
    definitionLocation({ line: 0, character: 1 }, { line: 0, character: 5 }),
  ]);
  assert.deepEqual(definitionsAt(source, posixBre), []);
});

test("GNU inline text remains opaque to structure, completion, and definition", async (t) => {
  for (const command of ["a", "c", "i"]) {
    await t.test(`${command} command`, () => {
      const source = `:real\n${command} b real;:fake}\nb real\n`;
      const document = createDocument(source);
      const structure = buildDocumentStructure(source, gnuBre);
      const opaquePosition = { line: 1, character: 6 };
      const finalReferencePosition = { line: 2, character: 4 };

      assert.deepEqual(structure.labelDefinitions, [
        {
          name: "real",
          range: { startOffset: 1, endOffset: 5 },
        },
      ]);
      assert.deepEqual(structure.labelReferences, [
        {
          command: "b",
          name: "real",
          range: { startOffset: 24, endOffset: 28 },
        },
      ]);
      assert.deepEqual(createCompletions(document, opaquePosition, gnuBre), []);
      assert.deepEqual(
        createDefinitionLocations(document, opaquePosition, gnuBre),
        [],
      );
      assert.deepEqual(
        createDefinitionLocations(document, finalReferencePosition, gnuBre),
        [
          definitionLocation(
            { line: 0, character: 1 },
            { line: 0, character: 5 },
          ),
        ],
      );
      assert.deepEqual(
        createCompletions(document, opaquePosition, posixBre),
        [],
      );
      assert.deepEqual(
        createDefinitionLocations(document, opaquePosition, posixBre),
        [],
      );
    });
  }
});

test("GNU filenames without separators remain opaque through the physical line", async (t) => {
  for (const command of ["r", "w"]) {
    await t.test(`${command} command`, () => {
      const source = `:real\n${command}b real;:fake}\nb real\n`;
      const document = createDocument(source);
      const structure = buildDocumentStructure(source, gnuBre);
      const opaquePosition = { line: 1, character: 5 };
      const finalReferencePosition = { line: 2, character: 4 };

      assert.deepEqual(structure.labelDefinitions, [
        {
          name: "real",
          range: { startOffset: 1, endOffset: 5 },
        },
      ]);
      assert.deepEqual(structure.labelReferences, [
        {
          command: "b",
          name: "real",
          range: { startOffset: 23, endOffset: 27 },
        },
      ]);
      assert.deepEqual(createCompletions(document, opaquePosition, gnuBre), []);
      assert.deepEqual(
        createDefinitionLocations(document, opaquePosition, gnuBre),
        [],
      );
      assert.deepEqual(
        createDefinitionLocations(document, finalReferencePosition, gnuBre),
        [
          definitionLocation(
            { line: 0, character: 1 },
            { line: 0, character: 5 },
          ),
        ],
      );
      assert.deepEqual(
        createCompletions(document, opaquePosition, posixBre),
        [],
      );
      assert.deepEqual(
        createDefinitionLocations(document, opaquePosition, posixBre),
        [],
      );
    });
  }
});

test("GNU editor recovery keeps semicolons inside comments opaque", async (t) => {
  const sources = [
    {
      name: "unexpected command text",
      source: "p extra# ignored;d",
    },
    {
      name: "invalid substitute flag",
      source: "s/a/b/X# ignored;d",
    },
    {
      name: "unknown command",
      source: "u# ignored;d",
    },
  ];

  for (const { name, source } of sources) {
    await t.test(name, () => {
      const structure = buildDocumentStructure(source, gnuBre);
      assert.equal(structure.contextAt(source.length - 1), null);
    });
  }
});

test("GNU numeric l and q arguments end before command-completion contexts", async (t) => {
  const completedArguments = ["q42;¦", "q 42;¦", "l0;¦", "l 0;¦"];

  for (const source of completedArguments) {
    await t.test(source.replace(cursorMarker, "<cursor>"), () => {
      assert.deepEqual(completionLabelsAt(source, gnuBre), gnuCommandLabels);
      assert.deepEqual(
        completionLabelsAt(source, posixBre),
        posixCommandLabels,
      );
    });
  }

  const numericPositions = ["q4¦2", "q ¦42", "l8¦0", "l ¦0"];
  for (const source of numericPositions) {
    await t.test(
      `${source.replace(cursorMarker, "<cursor>")} is opaque`,
      () => {
        assert.deepEqual(completionsAt(source, gnuBre), []);
      },
    );
  }
});

test("GNU structure continues after a command directly followed by a closing brace", () => {
  const markedSource = "{p};¦q";
  const { source } = parseMarkedSource(markedSource);
  const structure = buildDocumentStructure(source, gnuBre);

  assert.deepEqual(structure.contextAt(2), { kind: "command" });
  assert.deepEqual(structure.contextAt(4), { kind: "command" });
  assert.deepEqual(structure.labelDefinitions, []);
  assert.deepEqual(structure.labelReferences, []);
  assert.deepEqual(completionLabelsAt(markedSource, gnuBre), gnuCommandLabels);
});

test("the document-structure cache keeps GNU and POSIX label boundaries separate", () => {
  const source = ":loop;p\nb loop;p\n";
  const document = createDocument(source);
  const posixStructure = getDocumentStructure(document, posixBre);
  const gnuStructure = getDocumentStructure(document, gnuBre);

  assert.equal(getDocumentStructure(document, { ...posixBre }), posixStructure);
  assert.equal(getDocumentStructure(document, { ...gnuBre }), gnuStructure);
  assert.notEqual(posixStructure, gnuStructure);
  assert.deepEqual(posixStructure.labelDefinitions, [
    {
      name: "loop;p",
      range: { startOffset: 1, endOffset: 7 },
    },
  ]);
  assert.deepEqual(posixStructure.labelReferences, [
    {
      command: "b",
      name: "loop;p",
      range: { startOffset: 10, endOffset: 16 },
    },
  ]);
  assert.deepEqual(gnuStructure.labelDefinitions, [
    {
      name: "loop",
      range: { startOffset: 1, endOffset: 5 },
    },
  ]);
  assert.deepEqual(gnuStructure.labelReferences, [
    {
      command: "b",
      name: "loop",
      range: { startOffset: 10, endOffset: 14 },
    },
  ]);
  assert.deepEqual(posixStructure.contextAt(15), {
    kind: "branch-label",
    command: "b",
  });
  assert.deepEqual(gnuStructure.contextAt(15), { kind: "command" });
});

test("GNU shell text stays opaque to completion, labels, and definition", () => {
  const source =
    ":real\n" +
    "e :fake; T real # shell\n" +
    "e first\\\n" +
    ":fake; T real\n" +
    "p\n";
  const structure = buildDocumentStructure(source, gnuBre);

  assert.deepEqual(
    structure.labelDefinitions.map(({ name }) => name),
    ["real"],
  );
  assert.deepEqual(structure.labelReferences, []);
  assert.deepEqual(completionLabelsAt("e shell; ¦ } # opaque", gnuBre), []);
  assert.deepEqual(
    completionLabelsAt("e first\\\nT real; ¦ :fake\np\n", gnuBre),
    [],
  );
  assert.deepEqual(definitionsAt(":real\ne first\\\nT re¦al\n", gnuBre), []);
  assert.deepEqual(
    completionLabelsAt("e first\\\nstill shell\n¦", gnuBre),
    gnuCommandLabels,
  );
});

test("GNU R and W filenames stay opaque through their physical lines", async (t) => {
  const source = ":real\nR:fake;Treal\nW:fake;Treal\nTreal\n";
  const structure = buildDocumentStructure(source, gnuBre);

  assert.deepEqual(
    structure.labelDefinitions.map(({ name }) => name),
    ["real"],
  );
  assert.deepEqual(
    structure.labelReferences.map(({ command, name }) => ({ command, name })),
    [{ command: "T", name: "real" }],
  );

  for (const command of ["R", "W"]) {
    await t.test(`${command} filename`, () => {
      assert.deepEqual(completionLabelsAt(`${command}file;¦Treal`, gnuBre), []);
      assert.deepEqual(definitionsAt(`:real\n${command}T re¦al\n`, gnuBre), []);
      assert.deepEqual(
        completionLabelsAt(`${command}file\n¦`, gnuBre),
        gnuCommandLabels,
      );
    });
  }
});

test("GNU T offers label completion and goes to matching definitions", () => {
  assert.deepEqual(completionsAt(":target\nTta¦rget", gnuBre), [
    labelCompletion(
      "target",
      { line: 1, character: 1 },
      { line: 1, character: 7 },
    ),
  ]);
  assert.deepEqual(definitionsAt(":target\nTtar¦get", gnuBre), [
    definitionLocation({ line: 0, character: 1 }, { line: 0, character: 7 }),
  ]);
  assert.deepEqual(
    completionLabelsAt(":target\nTtarget;¦", gnuBre),
    gnuCommandLabels,
  );
  assert.deepEqual(
    completionLabelsAt(":target\nTtarget p;¦", gnuBre),
    gnuCommandLabels,
  );
});

test("GNU Q and v expose command completion only after their arguments", () => {
  assert.deepEqual(completionLabelsAt("Q42;¦", gnuBre), gnuCommandLabels);
  assert.deepEqual(completionLabelsAt("Q4¦2", gnuBre), []);
  assert.deepEqual(completionLabelsAt("v4.10;¦", gnuBre), gnuCommandLabels);
  assert.deepEqual(completionLabelsAt("v4.¦10", gnuBre), []);
  assert.deepEqual(completionLabelsAt("v4.10 p;¦", gnuBre), gnuCommandLabels);
});

test("does not insert a command between a GNU token and an existing command", () => {
  for (const source of [":loop\nTloop ¦ p", "v4.10 ¦ p"]) {
    assert.deepEqual(completionLabelsAt(source, gnuBre), []);
  }
});

test("GNU address extensions expose command completion at their end", async (t) => {
  const sources = [
    { name: "stepped line number", source: "0~2¦" },
    { name: "relative line count", source: "1,+2¦" },
    { name: "relative multiple", source: "1,~0¦" },
    { name: "modified regexp range", source: "0,/stop/I¦" },
    {
      name: "backslash regexp delimiter",
      source: String.raw`\\stop\I¦`,
    },
  ];

  for (const { name, source } of sources) {
    await t.test(name, () => {
      assert.deepEqual(completionLabelsAt(source, gnuBre), gnuCommandLabels);
    });
  }
});

test("GNU address extensions remain opaque before their end", async (t) => {
  const sources = [
    { name: "inside a numeric step", source: "1~¦2p" },
    { name: "inside a relative line count", source: "1,+¦2p" },
    { name: "before regexp modifiers", source: "/stop/¦IMp" },
    { name: "between regexp modifiers", source: "/stop/I¦Mp" },
  ];

  for (const { name, source } of sources) {
    await t.test(name, () => {
      assert.deepEqual(completionLabelsAt(source, gnuBre), []);
    });
  }
});

test("labels after GNU address extensions support completion and definition", () => {
  const source = ":loop\n1,+2b lo¦op";

  assert.deepEqual(completionsAt(source, gnuBre), [
    labelCompletion(
      "loop",
      { line: 1, character: 6 },
      { line: 1, character: 10 },
    ),
  ]);
  assert.deepEqual(definitionsAt(source, gnuBre), [
    definitionLocation({ line: 0, character: 1 }, { line: 0, character: 5 }),
  ]);
});

test("GNU address editor ranges use UTF-16 positions across CRLF lines", () => {
  const source = ":💣loop\r\n/💣/IMb 💣lo¦op\r\n";

  assert.deepEqual(completionsAt(source, gnuBre), [
    labelCompletion(
      "💣loop",
      { line: 1, character: 8 },
      { line: 1, character: 14 },
    ),
  ]);
  assert.deepEqual(definitionsAt(source, gnuBre), [
    definitionLocation({ line: 0, character: 1 }, { line: 0, character: 7 }),
  ]);
});

test("GNU address recovery exposes only later command regions", () => {
  assert.deepEqual(completionLabelsAt("1,;¦", gnuBre), gnuCommandLabels);
  assert.deepEqual(completionLabelsAt("//I;¦", gnuBre), gnuCommandLabels);
  assert.deepEqual(completionLabelsAt("1~2¦", posixBre), []);
});

test("GNU substitute-flag completion includes only the active profile", () => {
  const occurrenceLabels = Array.from({ length: 9 }, (_, index) =>
    String(index + 1),
  );

  assert.deepEqual(completionLabelsAt("s/a/b/¦", gnuBre), [
    ...occurrenceLabels,
    "g",
    "i",
    "p",
    "w",
    "e",
    "I",
    "M",
    "m",
  ]);
  assert.deepEqual(completionLabelsAt("s/a/b/¦", posixBre), [
    ...occurrenceLabels,
    "g",
    "i",
    "p",
    "w",
  ]);
});

test("malformed GNU substitute flags do not expose completion contexts", () => {
  assert.deepEqual(completionLabelsAt("s/a/b/2g3¦", gnuBre), []);
  assert.deepEqual(completionLabelsAt("s/a/b/000¦", gnuBre), []);
  assert.deepEqual(completionLabelsAt("s/a/b/gg¦", gnuBre), []);
  assert.notDeepEqual(completionLabelsAt("s/a/b/01¦", gnuBre), []);
});

test("GNU multiline regexp regions stay opaque and resume completion", () => {
  assert.deepEqual(completionLabelsAt("/fo¦o\\\nbar/p\n", gnuBre), []);
  assert.deepEqual(completionLabelsAt("/foo\\\nba¦r/p\n", gnuBre), []);
  assert.deepEqual(
    completionLabelsAt("/foo\\\nbar/¦", gnuBre),
    gnuCommandLabels,
  );
  assert.deepEqual(
    completionLabelsAt("/foo\\\nbar/;¦", gnuBre),
    gnuCommandLabels,
  );

  assert.deepEqual(completionLabelsAt("s/fo¦o\\\nbar/x/g\n", gnuBre), []);
  assert.deepEqual(completionLabelsAt("s/foo\\\nba¦r/x/g\n", gnuBre), []);
  assert.notDeepEqual(completionLabelsAt("s/foo\\\nbar/x/¦g\n", gnuBre), []);
});

test("GNU multiline and case-conversion replacements stay opaque", () => {
  const source =
    ":real\n" +
    "s/a/first\\\n" +
    ":fake;b real\\U/;b real\n" +
    "s/a/\\U:other;b real\\E/\n";
  const structure = buildDocumentStructure(source, gnuBre);

  assert.deepEqual(
    structure.labelDefinitions.map(({ name }) => name),
    ["real"],
  );
  assert.deepEqual(
    structure.labelReferences.map(({ command, name }) => ({ command, name })),
    [{ command: "b", name: "real" }],
  );
  assert.deepEqual(
    completionLabelsAt("s/a/first\\\n:fake;¦b real\\U/", gnuBre),
    [],
  );
  assert.deepEqual(
    definitionsAt(":real\ns/a/first\\\n:fake;b re¦al\\U/\n", gnuBre),
    [],
  );
  assert.deepEqual(completionLabelsAt("s/a/\\U:fake;¦b real\\E/", gnuBre), []);
  assert.deepEqual(
    definitionsAt(":real\ns/a/\\U:fake;b re¦al\\E/\n", gnuBre),
    [],
  );
  assert.deepEqual(
    completionLabelsAt("s/a/first\\\nsecond/;¦", gnuBre),
    gnuCommandLabels,
  );
});

test("keeps long unfinished editor constructs linear in both dialects", async (t) => {
  const cases = [
    {
      name: "POSIX unfinished bracket element",
      profile: posixBre,
      source: `/[[.${"a".repeat(100_000)}`,
    },
    {
      name: "GNU unfinished multiline regexp",
      profile: gnuBre,
      source: `/${"a\\\n".repeat(20_000)}`,
    },
  ];

  for (const { name, profile, source } of cases) {
    await t.test(name, () => {
      const document = createDocument(source);
      const startedAt = performance.now();

      assert.deepEqual(
        createCompletions(
          document,
          document.positionAt(document.getText().length),
          profile,
        ),
        [],
      );
      const elapsedMilliseconds = performance.now() - startedAt;
      assert.ok(
        elapsedMilliseconds < 1_000,
        `expected a linear editor scan under 1000 ms, received ${elapsedMilliseconds.toFixed(1)} ms`,
      );
    });
  }
});

test("GNU multiline addresses preserve continued opaque arguments", async (t) => {
  for (const command of ["a", "c", "i", "e"]) {
    await t.test(`${command} command`, () => {
      const source = `/\\c\n\\c\nx/${command} text\\\n:fake\np\n`;
      const structure = buildDocumentStructure(source, gnuBre);

      assert.deepEqual(structure.labelDefinitions, []);
      assert.deepEqual(structure.labelReferences, []);
      assert.equal(structure.contextAt(source.indexOf(":fake")), null);
      assert.deepEqual(structure.contextAt(source.lastIndexOf("p")), {
        kind: "command",
      });
    });
  }
});

test("an unfinished GNU multiline pattern consumes only its continued lines", () => {
  const definitionLikeText = buildDocumentStructure(
    "s/foo\\\n:fake\np\n",
    gnuBre,
  );
  assert.deepEqual(definitionLikeText.labelDefinitions, []);
  assert.deepEqual(definitionLikeText.labelReferences, []);

  const referenceLikeText = buildDocumentStructure(
    "s/foo\\\nb :fake\np\n",
    gnuBre,
  );
  assert.deepEqual(referenceLikeText.labelDefinitions, []);
  assert.deepEqual(referenceLikeText.labelReferences, []);
  assert.deepEqual(
    completionLabelsAt("s/foo\\\nb :fake\n¦p\n", gnuBre),
    gnuCommandLabels,
  );

  const unfinishedAddress = buildDocumentStructure(
    "/foo\\\n:fake\np\n",
    gnuBre,
  );
  assert.deepEqual(unfinishedAddress.labelDefinitions, []);
  assert.deepEqual(unfinishedAddress.labelReferences, []);
  assert.deepEqual(
    completionLabelsAt("/foo\\\n:fake\n¦p\n", gnuBre),
    gnuCommandLabels,
  );

  for (const source of [
    "s/foo\\\n:fake",
    "s/foo\\\nb target",
    "s/\\c\n:fake",
  ]) {
    const structure = buildDocumentStructure(source, gnuBre);
    assert.deepEqual(structure.labelDefinitions, []);
    assert.deepEqual(structure.labelReferences, []);
  }
});

test("continued syntax keeps its empty failure line and EOF opaque", async (t) => {
  const eofCases = [
    { name: "address", source: "/foo\\\n", profile: gnuBre },
    { name: "control address", source: "/\\c\n", profile: gnuBre },
    { name: "second address", source: "1,/foo\\\n", profile: gnuBre },
    { name: "substitute pattern", source: "s/foo\\\n", profile: gnuBre },
    { name: "GNU replacement", source: "s/a/x\\\n", profile: gnuBre },
    {
      name: "POSIX replacement",
      source: "s/a/x\\\n",
      profile: posixBre,
    },
  ];

  for (const { name, source, profile } of eofCases) {
    await t.test(`${name} at EOF`, () => {
      assert.equal(
        buildDocumentStructure(source, profile).contextAt(source.length),
        null,
      );
    });
  }

  const emptyLineCases = [
    "/foo\\\n¦\np\n",
    "1,/foo\\\n¦\np\n",
    "s/foo\\\n¦\np\n",
    "s/a/x\\\n¦\np\n",
  ];
  for (const source of emptyLineCases) {
    await t.test(source.replace(cursorMarker, "<cursor>"), () => {
      assert.deepEqual(completionLabelsAt(source, gnuBre), []);
    });
  }

  assert.deepEqual(completionLabelsAt("p\n¦", gnuBre), gnuCommandLabels);
});

test("labels after a GNU multiline address support completion and definition", () => {
  const source = ":target\n/foo\\\nbar/b tar¦get\n";

  assert.deepEqual(completionsAt(source, gnuBre), [
    labelCompletion(
      "target",
      { line: 2, character: 6 },
      { line: 2, character: 12 },
    ),
  ]);
  assert.deepEqual(definitionsAt(source, gnuBre), [
    definitionLocation({ line: 0, character: 1 }, { line: 0, character: 7 }),
  ]);
});

test("GNU substitute write filenames remain opaque until the next line", () => {
  assert.deepEqual(completionLabelsAt("s/a/b/w :fake;¦b fake\n", gnuBre), []);
  assert.deepEqual(
    completionLabelsAt("s/a/b/w :fake;b fake\n¦", gnuBre),
    gnuCommandLabels,
  );
  assert.deepEqual(definitionsAt(":fake\ns/a/b/w :fake;b fa¦ke\n", gnuBre), []);
});

test("the structure cache separates GNU substitute flags from POSIX flags", () => {
  const document = createDocument("s/a/b/e");

  assert.deepEqual(
    getDocumentStructure(document, gnuBre).contextAt(document.getText().length),
    { kind: "substitute-flag" },
  );
  assert.equal(
    getDocumentStructure(document, posixBre).contextAt(
      document.getText().length,
    ),
    null,
  );
});
