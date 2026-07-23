import assert from "node:assert/strict";
import test from "node:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { createDiagnostics } from "../src/diagnostics.js";
import {
  gnuManualAcceptanceCorpus,
  gnuManualRejectionCorpus,
} from "./fixtures/gnu-manual-corpus.js";

const posixBreProfile = Object.freeze({
  dialect: "posix",
  regexpMode: "bre",
});
const gnuBreProfile = Object.freeze({
  dialect: "gnu",
  regexpMode: "bre",
});

function diagnosticCodesFor(source, syntaxProfile) {
  const document = TextDocument.create(
    "file:///gnu-manual-corpus.sed",
    "sed",
    1,
    source,
  );
  return createDiagnostics(document, syntaxProfile).map(({ code }) => code);
}

test("accepts GNU sed 4.10 manual examples and rejects each extension in POSIX mode", async (t) => {
  for (const example of gnuManualAcceptanceCorpus) {
    await t.test(`${example.manualSection}: ${example.name}`, () => {
      assert.deepEqual(
        diagnosticCodesFor(example.source, gnuBreProfile),
        [],
        "GNU mode should accept the manual example",
      );
      assert.deepEqual(
        diagnosticCodesFor(example.source, posixBreProfile),
        example.posixDiagnosticCodes,
        "POSIX mode should reject the GNU extension",
      );
    });
  }
});

test("rejects GNU forms that the manual restricts", async (t) => {
  for (const example of gnuManualRejectionCorpus) {
    await t.test(`${example.manualSection}: ${example.name}`, () => {
      assert.deepEqual(
        diagnosticCodesFor(example.source, gnuBreProfile),
        example.gnuDiagnosticCodes,
      );
    });
  }
});
