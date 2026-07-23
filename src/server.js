#!/usr/bin/env node

import {
  createConnection,
  ErrorCodes,
  MessageType,
  ProposedFeatures,
  ResponseError,
  ShowMessageNotification,
  TextDocumentSyncKind,
  TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  completionProviderOptions,
  createCompletionHandler,
} from "./completion.js";
import { createDefinitionHandler, definitionProvider } from "./definition.js";
import { createDiagnostics } from "./diagnostics.js";
import { invalidateDocumentStructureCache } from "./document-structure.js";
import {
  defaultSyntaxProfile,
  resolveSyntaxProfile,
} from "./syntax-profile.js";

if (process.argv.length === 2) {
  process.argv.push("--stdio");
}

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
let activeSyntaxProfile = defaultSyntaxProfile;

const serverCapabilities = {
  textDocumentSync: TextDocumentSyncKind.Incremental,
  completionProvider: completionProviderOptions,
  definitionProvider,
};

function syntaxProfileErrorMessage(errors) {
  return errors.map(({ message }) => message).join(" ");
}

function configurationProfileOptions(settings) {
  if (
    settings !== null &&
    typeof settings === "object" &&
    !Array.isArray(settings) &&
    Object.hasOwn(settings, "sedLanguageServer")
  ) {
    return settings.sedLanguageServer;
  }

  return settings;
}

function publishDiagnostics(document, syntaxProfile = activeSyntaxProfile) {
  return connection.sendDiagnostics({
    uri: document.uri,
    version: document.version,
    diagnostics: createDiagnostics(document, syntaxProfile),
  });
}

connection.onInitialize(({ initializationOptions }) => {
  const result = resolveSyntaxProfile(initializationOptions);
  if (!result.ok) {
    return new ResponseError(
      ErrorCodes.InvalidParams,
      syntaxProfileErrorMessage(result.errors),
      { retry: false },
    );
  }

  activeSyntaxProfile = result.profile;
  return {
    capabilities: serverCapabilities,
  };
});

connection.onDidChangeConfiguration(async ({ settings }) => {
  const result = resolveSyntaxProfile(configurationProfileOptions(settings));
  if (!result.ok) {
    connection.sendNotification(ShowMessageNotification.type, {
      type: MessageType.Error,
      message: syntaxProfileErrorMessage(result.errors),
    });
    return;
  }

  const nextSyntaxProfile = result.profile;
  activeSyntaxProfile = nextSyntaxProfile;
  invalidateDocumentStructureCache();
  await Promise.all(
    documents
      .all()
      .map((document) => publishDiagnostics(document, nextSyntaxProfile)),
  );
});

connection.onCompletion(
  createCompletionHandler(documents, () => activeSyntaxProfile),
);
connection.onDefinition(
  createDefinitionHandler(documents, () => activeSyntaxProfile),
);

documents.onDidChangeContent(({ document }) => {
  publishDiagnostics(document);
});

documents.onDidClose(({ document }) => {
  invalidateDocumentStructureCache(document);
  connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
});

documents.listen(connection);
connection.listen();
