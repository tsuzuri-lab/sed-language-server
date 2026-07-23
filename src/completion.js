import {
  CompletionItemKind,
  InsertTextFormat,
} from "vscode-languageserver/node";
import { getDocumentStructure } from "./document-structure.js";
import {
  commandSpecificationsFor,
  substituteFlagSpecificationsFor,
} from "./sed-syntax.js";
import {
  defaultSyntaxProfile,
  requireSyntaxProfile,
} from "./syntax-profile.js";

function plainCompletion(label, kind, documentation) {
  return {
    label,
    kind,
    insertText: label,
    insertTextFormat: InsertTextFormat.PlainText,
    documentation,
  };
}

const commandCompletionsByProfile = new Map();
const substituteFlagCompletionsByProfile = new Map();

function commandCompletionsFor(syntaxProfile) {
  let completions = commandCompletionsByProfile.get(syntaxProfile);
  if (completions !== undefined) {
    return completions;
  }

  completions = [
    plainCompletion(
      ";",
      CompletionItemKind.Keyword,
      "Insert an empty command and begin the next command.",
    ),
    ...commandSpecificationsFor(syntaxProfile).map(
      ({ command, documentation }) =>
        plainCompletion(command, CompletionItemKind.Keyword, documentation),
    ),
  ];
  commandCompletionsByProfile.set(syntaxProfile, completions);
  return completions;
}

function substituteFlagCompletionsFor(syntaxProfile) {
  let completions = substituteFlagCompletionsByProfile.get(syntaxProfile);
  if (completions !== undefined) {
    return completions;
  }

  completions = [
    ...Array.from({ length: 9 }, (_, index) => {
      const occurrence = String(index + 1);
      return plainCompletion(
        occurrence,
        CompletionItemKind.Value,
        `Replace only occurrence number ${occurrence}.`,
      );
    }),
    ...substituteFlagSpecificationsFor(syntaxProfile).map(
      ({ flag, documentation }) =>
        plainCompletion(flag, CompletionItemKind.Keyword, documentation),
    ),
  ];
  substituteFlagCompletionsByProfile.set(syntaxProfile, completions);
  return completions;
}

export const completionProviderOptions = Object.freeze({});

function branchLabelEditRange(document, context, offset) {
  const replacementRange = context.replacementRange ?? {
    startOffset: offset,
    endOffset: offset,
  };
  const startOffset = Math.min(replacementRange.startOffset, offset);
  const endOffset = Math.max(replacementRange.endOffset, offset);

  return {
    start: document.positionAt(startOffset),
    end: document.positionAt(endOffset),
  };
}

export function createCompletions(
  document,
  position,
  options = defaultSyntaxProfile,
) {
  const syntaxProfile = requireSyntaxProfile(options);
  const structure = getDocumentStructure(document, syntaxProfile);
  const offset = document.offsetAt(position);
  const context = structure.contextDetailsAt(offset);

  if (context?.kind === "command") {
    return commandCompletionsFor(syntaxProfile).map((completion) => ({
      ...completion,
    }));
  }

  if (context?.kind === "substitute-flag") {
    return substituteFlagCompletionsFor(syntaxProfile).map((completion) => ({
      ...completion,
    }));
  }

  if (context?.kind !== "branch-label") {
    return [];
  }

  const names = new Set();
  const completions = [];
  const editRange = branchLabelEditRange(document, context, offset);
  for (const definition of structure.labelDefinitions) {
    if (names.has(definition.name)) {
      continue;
    }

    names.add(definition.name);
    completions.push({
      label: definition.name,
      kind: CompletionItemKind.Reference,
      insertTextFormat: InsertTextFormat.PlainText,
      documentation: "Branch label defined in this document.",
      textEdit: {
        range: editRange,
        newText: definition.name,
      },
    });
  }
  return completions;
}

export function createCompletionHandler(
  documents,
  getSyntaxProfile = () => defaultSyntaxProfile,
) {
  return ({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    return document === undefined
      ? null
      : createCompletions(document, position, getSyntaxProfile());
  };
}
