import { getDocumentStructure } from "./document-structure.js";
import { defaultSyntaxProfile } from "./syntax-profile.js";

export const definitionProvider = true;

function containsCursor(range, offset) {
  return range.startOffset <= offset && offset <= range.endOffset;
}

export function createDefinitionLocations(
  document,
  position,
  syntaxProfile = defaultSyntaxProfile,
) {
  const structure = getDocumentStructure(document, syntaxProfile);
  const offset = document.offsetAt(position);
  const reference = structure.labelReferences.find(({ range }) =>
    containsCursor(range, offset),
  );

  if (reference === undefined) {
    return [];
  }

  return structure.labelDefinitions
    .filter((definition) => definition.name === reference.name)
    .map((definition) => ({
      uri: document.uri,
      range: {
        start: document.positionAt(definition.range.startOffset),
        end: document.positionAt(definition.range.endOffset),
      },
    }));
}

export function createDefinitionHandler(
  documents,
  getSyntaxProfile = () => defaultSyntaxProfile,
) {
  return ({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    return document === undefined
      ? null
      : createDefinitionLocations(document, position, getSyntaxProfile());
  };
}
