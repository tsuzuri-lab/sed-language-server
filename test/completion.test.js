import assert from "node:assert/strict";
import test from "node:test";
import {
  CompletionItemKind,
  InsertTextFormat,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  completionProviderOptions,
  createCompletionHandler,
  createCompletions,
} from "../src/completion.js";

const cursorMarker = "¦";
const posixBre = { dialect: "posix", regexpMode: "bre" };
const posixEre = { dialect: "posix", regexpMode: "ere" };
const gnuBre = { dialect: "gnu", regexpMode: "bre" };
const gnuEre = { dialect: "gnu", regexpMode: "ere" };

function plainCompletion(label, kind, documentation) {
  return {
    label,
    kind,
    insertText: label,
    insertTextFormat: InsertTextFormat.PlainText,
    documentation,
  };
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

const expectedCommandCompletions = [
  plainCompletion(
    ";",
    CompletionItemKind.Keyword,
    "Insert an empty command and begin the next command.",
  ),
  plainCompletion(
    ":",
    CompletionItemKind.Keyword,
    "Define a label for b and t branches.",
  ),
  plainCompletion(
    "#",
    CompletionItemKind.Keyword,
    "Ignore the rest of the line as a comment.",
  ),
  plainCompletion(
    "}",
    CompletionItemKind.Keyword,
    "End the current command block.",
  ),
  plainCompletion(
    "=",
    CompletionItemKind.Keyword,
    "Write the current input line number.",
  ),
  plainCompletion(
    "a",
    CompletionItemKind.Keyword,
    "Queue text for output after the selected pattern space.",
  ),
  plainCompletion(
    "i",
    CompletionItemKind.Keyword,
    "Write text before the selected pattern space.",
  ),
  plainCompletion(
    "q",
    CompletionItemKind.Keyword,
    "Quit without starting another cycle.",
  ),
  plainCompletion(
    "r",
    CompletionItemKind.Keyword,
    "Queue a file's contents for output.",
  ),
  plainCompletion(
    "{",
    CompletionItemKind.Keyword,
    "Execute a command block when its address selects the pattern space.",
  ),
  plainCompletion(
    "b",
    CompletionItemKind.Keyword,
    "Branch to a label, or to the end of the script when omitted.",
  ),
  plainCompletion(
    "c",
    CompletionItemKind.Keyword,
    "Delete the selected line or range, write text in its place, and start the next cycle.",
  ),
  plainCompletion(
    "d",
    CompletionItemKind.Keyword,
    "Delete the pattern space and start the next cycle.",
  ),
  plainCompletion(
    "D",
    CompletionItemKind.Keyword,
    "Delete through the first newline and restart the cycle.",
  ),
  plainCompletion(
    "g",
    CompletionItemKind.Keyword,
    "Replace the pattern space with the hold space.",
  ),
  plainCompletion(
    "G",
    CompletionItemKind.Keyword,
    "Append a newline and the hold space to the pattern space.",
  ),
  plainCompletion(
    "h",
    CompletionItemKind.Keyword,
    "Replace the hold space with the pattern space.",
  ),
  plainCompletion(
    "H",
    CompletionItemKind.Keyword,
    "Append a newline and the pattern space to the hold space.",
  ),
  plainCompletion(
    "l",
    CompletionItemKind.Keyword,
    "Write the pattern space in a visually unambiguous form.",
  ),
  plainCompletion(
    "n",
    CompletionItemKind.Keyword,
    "Write the pattern space if default output is enabled, then read the next input line.",
  ),
  plainCompletion(
    "N",
    CompletionItemKind.Keyword,
    "Append the next input line to the pattern space.",
  ),
  plainCompletion("p", CompletionItemKind.Keyword, "Write the pattern space."),
  plainCompletion(
    "P",
    CompletionItemKind.Keyword,
    "Write the pattern space through its first newline.",
  ),
  plainCompletion(
    "s",
    CompletionItemKind.Keyword,
    "Replace regular-expression matches in the pattern space.",
  ),
  plainCompletion(
    "t",
    CompletionItemKind.Keyword,
    "Branch if a substitution has occurred since the latest input read or t command.",
  ),
  plainCompletion(
    "w",
    CompletionItemKind.Keyword,
    "Append the pattern space to a file.",
  ),
  plainCompletion(
    "x",
    CompletionItemKind.Keyword,
    "Exchange the pattern and hold spaces.",
  ),
  plainCompletion(
    "y",
    CompletionItemKind.Keyword,
    "Transliterate characters from one set to another.",
  ),
];

const expectedGnuCommandCompletions = [
  ...expectedCommandCompletions.map((completion) =>
    completion.label === ":"
      ? plainCompletion(
          ":",
          CompletionItemKind.Keyword,
          "Define a label for b, t, and T branches.",
        )
      : completion.label === "t"
        ? plainCompletion(
            "t",
            CompletionItemKind.Keyword,
            "Branch if a substitution has occurred since the latest input read or conditional branch.",
          )
        : completion,
  ),
  plainCompletion(
    "e",
    CompletionItemKind.Keyword,
    "Execute shell command text, or execute the pattern space when omitted.",
  ),
  plainCompletion(
    "F",
    CompletionItemKind.Keyword,
    "Write the current input filename.",
  ),
  plainCompletion(
    "Q",
    CompletionItemKind.Keyword,
    "Quit without writing the pattern space, optionally returning an exit status.",
  ),
  plainCompletion(
    "R",
    CompletionItemKind.Keyword,
    "Queue the next line from a file for output.",
  ),
  plainCompletion(
    "T",
    CompletionItemKind.Keyword,
    "Branch if no substitution has occurred since the latest input read or conditional branch.",
  ),
  plainCompletion(
    "v",
    CompletionItemKind.Keyword,
    "Require GNU sed, optionally at a minimum version.",
  ),
  plainCompletion(
    "W",
    CompletionItemKind.Keyword,
    "Append the pattern space through its first newline to a file.",
  ),
  plainCompletion("z", CompletionItemKind.Keyword, "Empty the pattern space."),
];

const expectedSubstituteFlagCompletions = [
  plainCompletion(
    "1",
    CompletionItemKind.Value,
    "Replace only occurrence number 1.",
  ),
  plainCompletion(
    "2",
    CompletionItemKind.Value,
    "Replace only occurrence number 2.",
  ),
  plainCompletion(
    "3",
    CompletionItemKind.Value,
    "Replace only occurrence number 3.",
  ),
  plainCompletion(
    "4",
    CompletionItemKind.Value,
    "Replace only occurrence number 4.",
  ),
  plainCompletion(
    "5",
    CompletionItemKind.Value,
    "Replace only occurrence number 5.",
  ),
  plainCompletion(
    "6",
    CompletionItemKind.Value,
    "Replace only occurrence number 6.",
  ),
  plainCompletion(
    "7",
    CompletionItemKind.Value,
    "Replace only occurrence number 7.",
  ),
  plainCompletion(
    "8",
    CompletionItemKind.Value,
    "Replace only occurrence number 8.",
  ),
  plainCompletion(
    "9",
    CompletionItemKind.Value,
    "Replace only occurrence number 9.",
  ),
  plainCompletion(
    "g",
    CompletionItemKind.Keyword,
    "Replace all non-overlapping matches.",
  ),
  plainCompletion(
    "i",
    CompletionItemKind.Keyword,
    "Match the regular expression case-insensitively.",
  ),
  plainCompletion(
    "p",
    CompletionItemKind.Keyword,
    "Write the pattern space if a replacement was made.",
  ),
  plainCompletion(
    "w",
    CompletionItemKind.Keyword,
    "Append the pattern space to a file if a replacement was made.",
  ),
];

const expectedGnuSubstituteFlagCompletions = [
  ...expectedSubstituteFlagCompletions,
  plainCompletion(
    "e",
    CompletionItemKind.Keyword,
    "Evaluate the replacement as a shell command after substituting.",
  ),
  plainCompletion(
    "I",
    CompletionItemKind.Keyword,
    "Match the regular expression case-insensitively.",
  ),
  plainCompletion(
    "M",
    CompletionItemKind.Keyword,
    "Make `^` and `$` also match around newlines in the pattern space.",
  ),
  plainCompletion(
    "m",
    CompletionItemKind.Keyword,
    "Make `^` and `$` also match around newlines in the pattern space.",
  ),
];

function createDocument(source, uri = "file:///test.sed") {
  return TextDocument.create(uri, "sed", 1, source);
}

function completionsAt(markedSource, syntaxProfile) {
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
  const document = createDocument(source);
  return createCompletions(
    document,
    document.positionAt(offset),
    syntaxProfile,
  );
}

test("returns every POSIX sed command as documented plain-text completion", () => {
  assert.deepEqual(completionsAt("¦"), expectedCommandCompletions);
});

test("returns GNU command completions only for the GNU syntax profile", () => {
  assert.deepEqual(completionsAt("¦", posixBre), completionsAt("¦"));
  assert.deepEqual(completionsAt("¦", posixEre), expectedCommandCompletions);
  assert.deepEqual(completionsAt("¦", gnuBre), expectedGnuCommandCompletions);
  assert.deepEqual(completionsAt("¦", gnuEre), expectedGnuCommandCompletions);
  for (const command of ["e", "F", "Q", "R", "T", "v", "W", "z"]) {
    assert.equal(
      completionsAt("¦", posixBre).some(({ label }) => label === command),
      false,
    );
  }
});

test("returns command completions at valid command positions", async (t) => {
  const positions = [
    {
      name: "after leading blanks",
      source: "  ¦",
    },
    {
      name: "after addresses and negation",
      source: "1,/pattern/! ¦",
    },
    {
      name: "after a semicolon separator",
      source: "p;  ¦",
    },
    {
      name: "after an empty command",
      source: ";¦",
    },
    {
      name: "at the beginning of the next physical line",
      source: "p\n¦",
    },
    {
      name: "inside a command block",
      source: "{\n  ¦\n}\n",
    },
  ];

  for (const { name, source } of positions) {
    await t.test(name, () => {
      assert.deepEqual(completionsAt(source), expectedCommandCompletions);
    });
  }
});

test("returns command completions in the middle of a blank command region", async (t) => {
  const positions = [
    {
      name: "blank physical line",
      source: " \t¦  ",
    },
    {
      name: "blank region after a command separator",
      source: "p; \t¦  ",
    },
    {
      name: "blank CRLF-delimited line",
      source: "p\r\n \t¦  \r\nq",
    },
  ];

  for (const { name, source } of positions) {
    await t.test(name, () => {
      assert.deepEqual(completionsAt(source), expectedCommandCompletions);
    });
  }
});

test("returns every POSIX substitute flag as documented plain-text completion", () => {
  assert.deepEqual(
    completionsAt("s/pattern/replacement/¦"),
    expectedSubstituteFlagCompletions,
  );
  assert.deepEqual(
    completionsAt("s/pattern/replacement/¦", posixEre),
    expectedSubstituteFlagCompletions,
  );
});

test("returns GNU substitute flags in both GNU regexp modes", () => {
  assert.deepEqual(
    completionsAt("s/pattern/replacement/¦", gnuBre),
    expectedGnuSubstituteFlagCompletions,
  );
  assert.deepEqual(
    completionsAt("s/pattern/replacement/¦", gnuEre),
    expectedGnuSubstituteFlagCompletions,
  );
});

test("returns substitute flag completions throughout a complete flag field", async (t) => {
  const positions = [
    {
      name: "after existing flags",
      source: "s/a/b/g¦p",
    },
    {
      name: "inside a multi-digit occurrence number",
      source: "s/a/b/20¦47",
    },
    {
      name: "before a command separator",
      source: "s/a/b/gp¦;q",
    },
    {
      name: "with a semicolon substitute delimiter",
      source: "s;a;b;¦;p",
    },
    {
      name: "after a replacement continued onto the next line",
      source: "s/a/first\\\nsecond/¦",
    },
  ];

  for (const { name, source } of positions) {
    await t.test(name, () => {
      assert.deepEqual(
        completionsAt(source),
        expectedSubstituteFlagCompletions,
      );
    });
  }
});

test("returns no substitute flag completions when invalid existing text would remain", async (t) => {
  const positions = [
    {
      name: "one invalid blank",
      source: "s/a/b/ ¦",
    },
    {
      name: "multiple invalid blanks",
      source: "s/a/b/  ¦",
    },
    {
      name: "invalid text after the cursor",
      source: "s/a/b/¦ e",
    },
    {
      name: "invalid flag character",
      source: "s/a/b/e¦",
    },
    {
      name: "zero at the beginning of an occurrence number",
      source: "s/a/b/0¦",
    },
    {
      name: "zero after a letter flag",
      source: "s/a/b/g0¦",
    },
  ];

  for (const { name, source } of positions) {
    await t.test(name, () => {
      assert.deepEqual(completionsAt(source), []);
    });
  }
});

test("allows substitute flag completion after a blank closing delimiter", () => {
  assert.deepEqual(completionsAt("s a b ¦"), expectedSubstituteFlagCompletions);
});

test("returns command completions after a substitute command separator", () => {
  assert.deepEqual(completionsAt("s/a/b/g;¦"), expectedCommandCompletions);
});

test("returns no command completions after a complete argumentless command", () => {
  assert.deepEqual(completionsAt("p¦"), []);
});

test("returns no command completions before trailing blanks inside a block", () => {
  assert.deepEqual(completionsAt("{\n \t¦  \n}\n"), []);
});

test("completes exact defined labels once and in source order", () => {
  const source =
    ":forward\n" +
    ":duplicate\n" +
    ":duplicate\n" +
    ":   spaced  \n" +
    ":Case\n" +
    ":case\n" +
    ":semi;#}\n" +
    "b reference-only\n" +
    "b ¦\n" +
    ":later\n";

  assert.deepEqual(completionsAt(source), [
    labelCompletion(
      "forward",
      { line: 8, character: 2 },
      { line: 8, character: 2 },
    ),
    labelCompletion(
      "duplicate",
      { line: 8, character: 2 },
      { line: 8, character: 2 },
    ),
    labelCompletion(
      "spaced  ",
      { line: 8, character: 2 },
      { line: 8, character: 2 },
    ),
    labelCompletion(
      "Case",
      { line: 8, character: 2 },
      { line: 8, character: 2 },
    ),
    labelCompletion(
      "case",
      { line: 8, character: 2 },
      { line: 8, character: 2 },
    ),
    labelCompletion(
      "semi;#}",
      { line: 8, character: 2 },
      { line: 8, character: 2 },
    ),
    labelCompletion(
      "later",
      { line: 8, character: 2 },
      { line: 8, character: 2 },
    ),
  ]);
});

test("returns label completions throughout valid branch and test label fields", async (t) => {
  const positions = [
    {
      name: "empty branch label",
      source: ":loop\nb ¦",
      start: { line: 1, character: 2 },
      end: { line: 1, character: 2 },
    },
    {
      name: "partially entered branch label",
      source: ":loop\nb lo¦",
      start: { line: 1, character: 2 },
      end: { line: 1, character: 4 },
    },
    {
      name: "empty test label",
      source: ":loop\nt ¦",
      start: { line: 1, character: 2 },
      end: { line: 1, character: 2 },
    },
    {
      name: "after additional syntactic blanks",
      source: ":loop\nb \t ¦",
      start: { line: 1, character: 4 },
      end: { line: 1, character: 4 },
    },
  ];

  for (const { name, source, start, end } of positions) {
    await t.test(name, () => {
      assert.deepEqual(completionsAt(source), [
        labelCompletion("loop", start, end),
      ]);
    });
  }
});

test("replaces the entered branch label through the cursor", () => {
  const completions = completionsAt(":a b\nb a ¦");

  assert.deepEqual(completions, [
    labelCompletion(
      "a b",
      { line: 1, character: 2 },
      { line: 1, character: 4 },
    ),
  ]);

  const edit = completions[0].textEdit;
  const source = "b a ";
  assert.equal(
    source.slice(0, edit.range.start.character) +
      edit.newText +
      source.slice(edit.range.end.character),
    "b a b",
  );
});

test("replaces the entire partially entered branch label", () => {
  const completions = completionsAt(":loop\nb lo¦nger");

  assert.deepEqual(completions, [
    labelCompletion(
      "loop",
      { line: 1, character: 2 },
      { line: 1, character: 8 },
    ),
  ]);

  const edit = completions[0].textEdit;
  const source = "b longer";
  assert.equal(
    source.slice(0, edit.range.start.character) +
      edit.newText +
      source.slice(edit.range.end.character),
    "b loop",
  );
});

test("replaces the label without creating a reversed edit inside leading blanks", () => {
  const completions = completionsAt(":loop\nb ¦  longer");

  assert.deepEqual(completions, [
    labelCompletion(
      "loop",
      { line: 1, character: 2 },
      { line: 1, character: 10 },
    ),
  ]);

  const edit = completions[0].textEdit;
  const source = "b   longer";
  assert.equal(
    source.slice(0, edit.range.start.character) +
      edit.newText +
      source.slice(edit.range.end.character),
    "b loop",
  );
});

test("does not offer omitted definitions or branch references as labels", () => {
  const source = ":\n:   \nb missing\nb ¦";

  assert.deepEqual(completionsAt(source), []);
});

test("returns no completions inside opaque sed syntax regions", async (t) => {
  const positions = [
    {
      name: "comment",
      source: "# s/a/b/¦\np\n",
    },
    {
      name: "append text argument",
      source: "a\\\ntext ¦\np\n",
    },
    {
      name: "change text argument",
      source: "c\\\ntext ¦\np\n",
    },
    {
      name: "insert text argument",
      source: "i\\\ntext ¦\np\n",
    },
    {
      name: "read filename",
      source: "r input;¦\n",
    },
    {
      name: "write filename",
      source: "w output;¦\n",
    },
    {
      name: "context-address regular expression",
      source: "/a¦/p\n",
    },
    {
      name: "substitute pattern",
      source: "s/a¦/b/\n",
    },
    {
      name: "substitute replacement",
      source: "s/a/b¦/\n",
    },
    {
      name: "substitute write filename",
      source: "s/a/b/w output;¦\n",
    },
    {
      name: "first transliterate string",
      source: "y/a¦/b/\n",
    },
    {
      name: "second transliterate string",
      source: "y/a/b¦/\n",
    },
    {
      name: "label definition",
      source: ":lo¦op\n",
    },
  ];

  for (const { name, source } of positions) {
    await t.test(name, () => {
      assert.deepEqual(completionsAt(source), []);
    });
  }
});

test("returns no label completions without the required literal space", async (t) => {
  const positions = [
    {
      name: "branch command without a separator",
      source: ":loop\nb¦",
    },
    {
      name: "tab used as the branch separator",
      source: ":loop\nb\t¦loop",
    },
    {
      name: "test command without a separator",
      source: ":loop\nt¦",
    },
    {
      name: "tab used as the test separator",
      source: ":loop\nt\t¦loop",
    },
  ];

  for (const { name, source } of positions) {
    await t.test(name, () => {
      assert.deepEqual(completionsAt(source), []);
    });
  }
});

test("uses UTF-16 LSP positions for command and substitute flag completion", async (t) => {
  await t.test("command after a supplementary-plane address character", () => {
    const document = createDocument("/😀/");

    assert.deepEqual(
      createCompletions(document, { line: 0, character: 4 }),
      expectedCommandCompletions,
    );
  });

  await t.test(
    "substitute flags after a supplementary-plane replacement character",
    () => {
      const document = createDocument("s/x/😀/");

      assert.deepEqual(
        createCompletions(document, { line: 0, character: 7 }),
        expectedSubstituteFlagCompletions,
      );
    },
  );
});

test("uses CRLF LSP positions for commands and supplementary-plane labels", async (t) => {
  await t.test("command at the beginning of a CRLF-delimited line", () => {
    const document = createDocument("# comment\r\n");

    assert.deepEqual(
      createCompletions(document, { line: 1, character: 0 }),
      expectedCommandCompletions,
    );
  });

  await t.test("label after a CRLF-delimited definition", () => {
    const document = createDocument(":😀loop\r\nb ");

    assert.deepEqual(createCompletions(document, { line: 1, character: 2 }), [
      labelCompletion(
        "😀loop",
        { line: 1, character: 2 },
        { line: 1, character: 2 },
      ),
    ]);
  });

  await t.test(
    "partial supplementary-plane label after a CRLF-delimited definition",
    () => {
      const document = createDocument(":😀 loop\r\nb 😀tail");

      assert.deepEqual(createCompletions(document, { line: 1, character: 4 }), [
        labelCompletion(
          "😀 loop",
          { line: 1, character: 2 },
          { line: 1, character: 8 },
        ),
      ]);
    },
  );
});

test("completion handler resolves the requested open document", () => {
  const uri = "file:///known.sed";
  const document = createDocument("", uri);
  const documents = {
    get(requestedUri) {
      return requestedUri === uri ? document : undefined;
    },
  };
  const handler = createCompletionHandler(documents);

  assert.deepEqual(
    handler({
      textDocument: { uri },
      position: { line: 0, character: 0 },
    }),
    expectedCommandCompletions,
  );
});

test("completion handler reads the current syntax profile for every request", () => {
  const uri = "file:///profile.sed";
  const document = createDocument("", uri);
  const documents = {
    get(requestedUri) {
      return requestedUri === uri ? document : undefined;
    },
  };
  let syntaxProfile = posixBre;
  let profileReads = 0;
  const handler = createCompletionHandler(documents, () => {
    profileReads += 1;
    return syntaxProfile;
  });
  const request = {
    textDocument: { uri },
    position: { line: 0, character: 0 },
  };

  assert.equal(
    handler(request).some(({ label }) => label === "z"),
    false,
  );

  syntaxProfile = gnuBre;

  assert.equal(
    handler(request).some(({ label }) => label === "z"),
    true,
  );
  assert.equal(profileReads, 2);
});

test("completion handler returns null for an unknown document URI", () => {
  const documents = {
    get() {
      return undefined;
    },
  };
  const handler = createCompletionHandler(documents);

  assert.equal(
    handler({
      textDocument: { uri: "file:///unknown.sed" },
      position: { line: 0, character: 0 },
    }),
    null,
  );
});

test("completion provider does not advertise unsupported resolve or trigger behavior", () => {
  assert.deepEqual(completionProviderOptions, {});
});

test("returns independent completion items for each request", async (t) => {
  const contexts = [
    {
      name: "commands",
      source: "¦",
      expected: expectedCommandCompletions,
    },
    {
      name: "substitute flags",
      source: "s/a/b/¦",
      expected: expectedSubstituteFlagCompletions,
    },
  ];

  for (const { name, source, expected } of contexts) {
    await t.test(name, () => {
      const firstResult = completionsAt(source);
      firstResult.pop();
      firstResult[0].label = "changed";

      assert.deepEqual(completionsAt(source), expected);
    });
  }
});
