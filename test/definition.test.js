import assert from "node:assert/strict";
import test from "node:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  createDefinitionHandler,
  createDefinitionLocations,
  definitionProvider,
} from "../src/definition.js";

const cursorMarker = "¦";
const defaultUri = "file:///labels.sed";
const posixBre = { dialect: "posix", regexpMode: "bre" };
const gnuBre = { dialect: "gnu", regexpMode: "bre" };

function createDocument(source, uri = defaultUri) {
  return TextDocument.create(uri, "sed", 1, source);
}

function locationsAt(markedSource, uri = defaultUri, syntaxProfile) {
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
  const document = createDocument(source, uri);
  return createDefinitionLocations(
    document,
    document.positionAt(offset),
    syntaxProfile,
  );
}

function location(line, startCharacter, endCharacter, uri = defaultUri) {
  return {
    uri,
    range: {
      start: { line, character: startCharacter },
      end: { line, character: endCharacter },
    },
  };
}

test("resolves forward and backward label references", async (t) => {
  await t.test("forward b reference", () => {
    assert.deepEqual(locationsAt("b for¦ward\n:forward\n"), [
      location(1, 1, 8),
    ]);
  });

  await t.test("backward t reference", () => {
    assert.deepEqual(locationsAt(":backward\nt back¦ward\n"), [
      location(0, 1, 9),
    ]);
  });
});

test("uses POSIX BRE definition behavior by default", () => {
  const source = ":loop\nb lo¦op\n";

  assert.deepEqual(
    locationsAt(source, defaultUri, posixBre),
    locationsAt(source),
  );
});

test("returns every duplicate definition in source order", () => {
  const source = ":loop\n:loop\nb lo¦op\n";

  assert.deepEqual(locationsAt(source), [location(0, 1, 5), location(1, 1, 5)]);
});

test("returns no location for missing, omitted, blank, or invalid labels", async (t) => {
  const cases = [
    {
      name: "unresolved label",
      source: ":known\nb mis¦sing\n",
    },
    {
      name: "omitted branch label",
      source: ":known\nb¦\n",
    },
    {
      name: "omitted test label",
      source: ":known\nt¦\n",
    },
    {
      name: "blank-only branch label",
      source: ":known\nb  ¦  \n",
    },
    {
      name: "tab used instead of the required literal space",
      source: ":known\nb\tkn¦own\n",
    },
  ];

  for (const { name, source } of cases) {
    await t.test(name, () => {
      assert.deepEqual(locationsAt(source), []);
    });
  }
});

test("matches labels with exact POSIX whitespace", async (t) => {
  await t.test("label without trailing blanks", () => {
    const source = ":loop\n:loop  \n:   spaced  \nb lo¦op\n";

    assert.deepEqual(locationsAt(source), [location(0, 1, 5)]);
  });

  await t.test("label with trailing blanks", () => {
    const source = ":loop\n:loop  \nb loop ¦ \n";

    assert.deepEqual(locationsAt(source), [location(1, 1, 7)]);
  });

  await t.test("syntactic leading blanks are not part of the label", () => {
    const source = ":   spaced  \nt \t spa¦ced  \n";

    assert.deepEqual(locationsAt(source), [location(0, 4, 12)]);
  });

  await t.test("different trailing blanks do not match", () => {
    assert.deepEqual(locationsAt(":loop  \nb lo¦op\n"), []);
  });
});

test("matches case, punctuation, and Unicode spelling exactly", async (t) => {
  await t.test("case-sensitive labels", () => {
    const source = ":Case\n:case\nb Ca¦se\n";

    assert.deepEqual(locationsAt(source), [location(0, 1, 5)]);
  });

  await t.test("punctuation remains part of a physical-line label", () => {
    const source = ":semi;#}\nb semi;¦#}\n";

    assert.deepEqual(locationsAt(source), [location(0, 1, 8)]);
  });

  await t.test("precomposed Unicode label", () => {
    const source = ":é\n:e\u0301\nb é¦\n";

    assert.deepEqual(locationsAt(source), [location(0, 1, 2)]);
  });

  await t.test("decomposed Unicode label is a different name", () => {
    const source = ":é\n:e\u0301\nb e\u0301¦\n";

    assert.deepEqual(locationsAt(source), [location(1, 1, 3)]);
  });
});

test("resolves only when the cursor is on the reference range", async (t) => {
  const expected = [location(0, 1, 5)];
  const positions = [
    {
      name: "start of the label",
      source: ":loop\nb   ¦loop\n",
      expected,
    },
    {
      name: "inside the label",
      source: ":loop\nb   lo¦op\n",
      expected,
    },
    {
      name: "end of the label",
      source: ":loop\nb   loop¦\n",
      expected,
    },
    {
      name: "syntactic leading blank",
      source: ":loop\nb ¦  loop\n",
      expected: [],
    },
  ];

  for (const { name, source, expected: expectedLocations } of positions) {
    await t.test(name, () => {
      assert.deepEqual(locationsAt(source), expectedLocations);
    });
  }
});

test("does not resolve references written inside opaque sed syntax regions", async (t) => {
  const positions = [
    {
      name: "comment",
      source: ":loop\n# b lo¦op\n",
    },
    {
      name: "append text argument",
      source: ":loop\na\\\nb lo¦op\np\n",
    },
    {
      name: "change text argument",
      source: ":loop\nc\\\nb lo¦op\np\n",
    },
    {
      name: "insert text argument",
      source: ":loop\ni\\\nb lo¦op\np\n",
    },
    {
      name: "read filename",
      source: ":loop\nr b lo¦op\n",
    },
    {
      name: "write filename",
      source: ":loop\nw b lo¦op\n",
    },
    {
      name: "context-address regular expression",
      source: ":loop\n/b lo¦op/p\n",
    },
    {
      name: "substitute pattern",
      source: ":loop\ns/b lo¦op/x/\n",
    },
    {
      name: "substitute replacement",
      source: ":loop\ns/x/b lo¦op/\n",
    },
    {
      name: "substitute write filename",
      source: ":loop\ns/x/y/w b lo¦op\n",
    },
    {
      name: "first transliterate string",
      source: ":loop\ny/b lo¦op/x/\n",
    },
    {
      name: "second transliterate string",
      source: ":loop\ny/x/b lo¦op/\n",
    },
    {
      name: "label definition",
      source: ":lo¦op\nb loop\n",
    },
  ];

  for (const { name, source } of positions) {
    await t.test(name, () => {
      assert.deepEqual(locationsAt(source), []);
    });
  }
});

test("does not use label-like text in opaque regions as definitions", () => {
  const source =
    "# :loop\n" +
    "a\\\n" +
    ":loop\n" +
    "r :loop\n" +
    "w :loop\n" +
    "/:loop/p\n" +
    "s/:loop/x/\n" +
    "s/x/:loop/\n" +
    "s/x/y/w :loop\n" +
    "y/:loop/x/\n" +
    "y/x/:loop/\n" +
    "b lo¦op\n";

  assert.deepEqual(locationsAt(source), []);
});

test("returns UTF-16 definition ranges across CRLF lines", () => {
  const source = ":😀loop\r\nb 😀lo¦op\r\n";

  assert.deepEqual(locationsAt(source), [location(0, 1, 7)]);
});

test("definition handler resolves the requested open document", () => {
  const uri = "file:///known.sed";
  const document = createDocument(":loop\nb loop\n", uri);
  const documents = {
    get(requestedUri) {
      return requestedUri === uri ? document : undefined;
    },
  };
  const handler = createDefinitionHandler(documents);

  assert.deepEqual(
    handler({
      textDocument: { uri },
      position: { line: 1, character: 4 },
    }),
    [location(0, 1, 5, uri)],
  );
});

test("definition handler reads the current syntax profile for every request", () => {
  const uri = "file:///profile-labels.sed";
  const document = createDocument(":loop;p\nb loop;p\n", uri);
  const documents = {
    get(requestedUri) {
      return requestedUri === uri ? document : undefined;
    },
  };
  let syntaxProfile = posixBre;
  let profileReads = 0;
  const handler = createDefinitionHandler(documents, () => {
    profileReads += 1;
    return syntaxProfile;
  });
  const request = {
    textDocument: { uri },
    position: { line: 1, character: 4 },
  };

  assert.deepEqual(handler(request), [location(0, 1, 7, uri)]);

  syntaxProfile = gnuBre;

  assert.deepEqual(handler(request), [location(0, 1, 5, uri)]);
  assert.equal(profileReads, 2);
});

test("definition handler returns null for an unknown document URI", () => {
  const documents = {
    get() {
      return undefined;
    },
  };
  const handler = createDefinitionHandler(documents);

  assert.equal(
    handler({
      textDocument: { uri: "file:///unknown.sed" },
      position: { line: 0, character: 0 },
    }),
    null,
  );
});

test("definition provider advertises support with no unsupported options", () => {
  assert.equal(definitionProvider, true);
});
