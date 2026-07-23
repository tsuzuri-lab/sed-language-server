import {
  characterAt,
  commandSpecificationsFor,
  createSubstituteFlagState,
  findLineEnd,
  findReplacementDelimiter,
  findTransliterateDelimiter,
  hasUnescapedTrailingBackslash,
  scanAddressSyntax,
  scanCommandEndSyntax,
  scanCommandRecoverySyntax,
  scanLabelArgumentSyntax,
  scanOptionalNumericArgumentSyntax,
  scanRegexDelimiter,
  scanShellCommandSyntax,
  scanSubstituteFlagTokenSyntax,
  scanTextCommandSyntax,
  scanVersionArgumentSyntax,
  skipBlanks,
  syntaxPolicyFor,
} from "./sed-syntax.js";
import {
  defaultSyntaxProfile,
  requireSyntaxProfile,
} from "./syntax-profile.js";

const commandKindsByProfile = new Map();

function commandKindsFor(syntaxProfile) {
  let commandKinds = commandKindsByProfile.get(syntaxProfile);
  if (commandKinds !== undefined) {
    return commandKinds;
  }

  commandKinds = new Map(
    commandSpecificationsFor(syntaxProfile).map(({ command, kind }) => [
      command,
      kind,
    ]),
  );
  commandKindsByProfile.set(syntaxProfile, commandKinds);
  return commandKinds;
}

function scanCommandHeader(text, offset, lineEnd, syntaxProfile) {
  const policy = syntaxPolicyFor(syntaxProfile);
  const addressScanEnd = policy.regexp.escapedPhysicalNewlines
    ? text.length
    : lineEnd;
  let cursor = skipBlanks(text, offset, lineEnd);
  let commandContextStart = offset;
  const firstAddress = scanAddressSyntax(
    text,
    cursor,
    addressScanEnd,
    syntaxProfile,
  );

  if (
    firstAddress.kind === "invalid" ||
    firstAddress.kind === "indeterminate"
  ) {
    if (firstAddress.endOffset > lineEnd) {
      lineEnd = findLineEnd(text, firstAddress.endOffset);
    }
    return {
      commandContextStart: null,
      commandOffset: null,
      lineEnd,
      resumeOffset: null,
    };
  }

  if (firstAddress.kind === "valid") {
    commandContextStart = firstAddress.endOffset;
    if (firstAddress.endOffset > lineEnd) {
      lineEnd = findLineEnd(text, firstAddress.endOffset);
    }
    cursor = skipBlanks(text, firstAddress.endOffset, lineEnd);

    while (text[cursor] === ",") {
      cursor = skipBlanks(text, cursor + 1, lineEnd);
      const nextAddress = scanAddressSyntax(
        text,
        cursor,
        addressScanEnd,
        syntaxProfile,
      );

      if (
        nextAddress.kind === "invalid" ||
        nextAddress.kind === "indeterminate"
      ) {
        if (nextAddress.endOffset > lineEnd) {
          lineEnd = findLineEnd(text, nextAddress.endOffset);
        }
        return {
          commandContextStart: null,
          commandOffset: null,
          lineEnd,
          resumeOffset: null,
        };
      }

      if (nextAddress.kind === "none") {
        if (text[cursor] === ";") {
          return {
            commandContextStart: null,
            commandOffset: null,
            lineEnd,
            resumeOffset: cursor + 1,
          };
        }

        if (cursor >= lineEnd) {
          return {
            commandContextStart: null,
            commandOffset: null,
            lineEnd,
            resumeOffset: null,
          };
        }
        break;
      }

      commandContextStart = nextAddress.endOffset;
      if (nextAddress.endOffset > lineEnd) {
        lineEnd = findLineEnd(text, nextAddress.endOffset);
      }
      cursor = skipBlanks(text, nextAddress.endOffset, lineEnd);
    }
  }

  if (text[cursor] === "!") {
    commandContextStart = cursor + 1;
    cursor = skipBlanks(text, cursor + 1, lineEnd);
  }

  return {
    commandContextStart,
    commandOffset: cursor,
    lineEnd,
    resumeOffset: null,
  };
}

function scanCommandEnd(text, commandEnd, lineEnd, syntaxProfile, state = {}) {
  return scanCommandEndSyntax(text, commandEnd, lineEnd, syntaxProfile, state)
    .nextCommandOffset;
}

function scanSubstituteTail(
  text,
  flagsOffset,
  lineEnd,
  recoverAtClosingBrace,
  syntaxProfile,
) {
  const policy = syntaxPolicyFor(syntaxProfile);
  const canRecoverAtClosingBrace =
    recoverAtClosingBrace || policy.commandEnd.closingBraceTerminates;
  let cursor = flagsOffset;
  let flagState = createSubstituteFlagState();

  while (cursor < lineEnd) {
    const character = characterAt(text, cursor);
    if (character === null) {
      break;
    }

    if (character.value === ";") {
      return {
        contextEnd: cursor,
        nextCommandOffset: cursor + character.width,
      };
    }

    if (policy.commandEnd.commentTerminates && character.value === "#") {
      return {
        contextEnd: cursor,
        nextCommandOffset: null,
      };
    }

    if (canRecoverAtClosingBrace && character.value === "}") {
      return {
        contextEnd: cursor,
        nextCommandOffset: cursor,
      };
    }

    if (
      policy.substituteFlags.separator === "optional-blanks" &&
      (character.value === " " || character.value === "\t")
    ) {
      cursor = skipBlanks(text, cursor, lineEnd);
      continue;
    }

    const token = scanSubstituteFlagTokenSyntax(
      text,
      cursor,
      lineEnd,
      flagState,
      syntaxProfile,
    );
    if (token.kind === "flag" || token.kind === "occurrence") {
      flagState = token.state;
      cursor = token.endOffset;
      continue;
    }

    if (token.kind === "write") {
      return {
        contextEnd: cursor,
        nextCommandOffset: null,
      };
    }

    const recovery = scanCommandRecoverySyntax(
      text,
      token.endOffset,
      lineEnd,
      syntaxProfile,
      { recoverAtClosingBrace: canRecoverAtClosingBrace },
    );
    if (recovery.recoveryOffset === null) {
      return {
        contextEnd: null,
        nextCommandOffset: null,
      };
    }

    return {
      contextEnd: null,
      nextCommandOffset: recovery.nextCommandOffset,
    };
  }

  return {
    contextEnd: lineEnd,
    nextCommandOffset: null,
  };
}

function scanSubstitute(
  text,
  commandOffset,
  lineEnd,
  recoverAtClosingBrace,
  syntaxProfile,
) {
  const policy = syntaxPolicyFor(syntaxProfile);
  const delimiterOffset = commandOffset + 1;
  if (delimiterOffset >= lineEnd) {
    return {
      context: null,
      consumedUntil: lineEnd,
      nextCommandOffset: null,
    };
  }

  const delimiter = characterAt(text, delimiterOffset);
  if (delimiter === null || delimiter.value === "\\") {
    return {
      context: null,
      consumedUntil: lineEnd,
      nextCommandOffset: null,
    };
  }

  const pattern = scanRegexDelimiter(
    text,
    delimiterOffset + delimiter.width,
    policy.regexp.escapedPhysicalNewlines ? text.length : lineEnd,
    delimiter,
    syntaxProfile,
  );
  const patternEnd =
    pattern.closingOffset ??
    (syntaxProfile.dialect === "posix" && pattern.hasUnclosedBracketExpression
      ? pattern.possibleClosingOffset
      : null);
  if (patternEnd === null) {
    return {
      context: null,
      consumedUntil:
        pattern.failureOffset ??
        (policy.regexp.escapedPhysicalNewlines ? text.length : lineEnd),
      nextCommandOffset: null,
    };
  }

  const replacement = findReplacementDelimiter(
    text,
    patternEnd + delimiter.width,
    delimiter,
    syntaxProfile,
  );
  if (replacement.closingOffset === null) {
    return {
      context: null,
      consumedUntil: replacement.failureOffset,
      nextCommandOffset: null,
    };
  }

  const flagsOffset = replacement.closingOffset + delimiter.width;
  const flagsLineEnd =
    flagsOffset <= lineEnd ? lineEnd : findLineEnd(text, flagsOffset);
  const tail = scanSubstituteTail(
    text,
    flagsOffset,
    flagsLineEnd,
    recoverAtClosingBrace,
    syntaxProfile,
  );

  return {
    context:
      tail.contextEnd === null
        ? null
        : {
            startOffset: flagsOffset,
            endOffset: tail.contextEnd,
            value: { kind: "substitute-flag" },
          },
    consumedUntil: flagsLineEnd,
    nextCommandOffset: tail.nextCommandOffset,
  };
}

function scanTransliterate(text, commandOffset, lineEnd, syntaxProfile) {
  const delimiterOffset = commandOffset + 1;
  if (delimiterOffset >= lineEnd) {
    return null;
  }

  const delimiter = characterAt(text, delimiterOffset);
  if (
    delimiter === null ||
    delimiter.value === "\\" ||
    delimiter.value === "\n"
  ) {
    return null;
  }

  const firstStringEnd = findTransliterateDelimiter(
    text,
    delimiterOffset + delimiter.width,
    lineEnd,
    delimiter,
    syntaxProfile,
  );
  if (firstStringEnd === null) {
    return null;
  }

  const secondStringEnd = findTransliterateDelimiter(
    text,
    firstStringEnd + delimiter.width,
    lineEnd,
    delimiter,
    syntaxProfile,
  );
  if (secondStringEnd === null) {
    return null;
  }

  return secondStringEnd + delimiter.width;
}

function range(startOffset, endOffset) {
  return { startOffset, endOffset };
}

export function buildDocumentStructure(text, options = defaultSyntaxProfile) {
  const syntaxProfile = requireSyntaxProfile(options);
  const commandKinds = commandKindsFor(syntaxProfile);
  const contexts = [];
  const labelDefinitions = [];
  const labelReferences = [];
  let blockDepth = 0;
  let consumedUntil = -1;
  let lineStart = 0;
  let pendingCommandOffset = null;
  let continuedOpaqueArgument = false;

  function addCommandContext(startOffset, endOffset = startOffset) {
    contexts.push({
      startOffset,
      endOffset,
      value: { kind: "command" },
    });
  }

  function addLabel(command, commandOffset, lineEnd) {
    const argument = scanLabelArgumentSyntax(
      text,
      commandOffset,
      lineEnd,
      syntaxProfile,
    );

    if (command === ":") {
      if (argument.hasLabel) {
        labelDefinitions.push({
          name: argument.name,
          range: range(argument.labelStartOffset, argument.labelEndOffset),
        });
      }
      return argument;
    }

    if (!argument.hasValidSeparator) {
      return argument;
    }

    contexts.push({
      startOffset: argument.branchContextStartOffset,
      endOffset: argument.fieldEndOffset,
      replacementRange: range(
        argument.labelStartOffset,
        argument.labelEndOffset,
      ),
      value: { kind: "branch-label", command },
    });

    if (argument.hasLabel) {
      labelReferences.push({
        command,
        name: argument.name,
        range: range(argument.labelStartOffset, argument.labelEndOffset),
      });
    }

    return argument;
  }

  function scanLine(initialOffset, lineEnd) {
    let commandSearchOffset = initialOffset;

    while (commandSearchOffset <= lineEnd) {
      const header = scanCommandHeader(
        text,
        commandSearchOffset,
        lineEnd,
        syntaxProfile,
      );
      if (header.lineEnd > lineEnd) {
        lineEnd = header.lineEnd;
        consumedUntil = Math.max(consumedUntil, lineEnd);
      }
      if (header.resumeOffset !== null) {
        commandSearchOffset = header.resumeOffset;
        continue;
      }

      if (header.commandOffset === null) {
        break;
      }

      const commandOffset = header.commandOffset;
      // POSIX forbids trailing blanks after commands inside a command block.
      const commandContextStart =
        commandOffset >= lineEnd &&
        blockDepth === 0 &&
        header.commandContextStart !== null
          ? header.commandContextStart
          : commandOffset;
      addCommandContext(commandContextStart, commandOffset);
      if (commandOffset >= lineEnd) {
        break;
      }

      const commandCharacter = characterAt(text, commandOffset);
      if (commandCharacter === null) {
        break;
      }

      if (commandCharacter.value === ";") {
        commandSearchOffset = commandOffset + commandCharacter.width;
        continue;
      }

      const kind = commandKinds.get(commandCharacter.value);
      if (kind === undefined) {
        const nextCommandOffset = scanCommandEnd(
          text,
          commandOffset + commandCharacter.width,
          lineEnd,
          syntaxProfile,
          { insideBlock: blockDepth > 0 },
        );
        if (nextCommandOffset === null) {
          break;
        }
        commandSearchOffset = nextCommandOffset;
        continue;
      }

      if (kind === "line" || kind === "file") {
        break;
      }

      if (kind === "text") {
        const hasPhysicalNewline =
          text[lineEnd] === "\n" ||
          (text[lineEnd] === "\r" && text[lineEnd + 1] === "\n");
        const argument = scanTextCommandSyntax(
          text,
          commandOffset,
          lineEnd,
          hasPhysicalNewline,
          syntaxProfile,
        );
        continuedOpaqueArgument = argument.consumesFollowingTextLine ?? false;
        break;
      }

      if (kind === "shell") {
        const hasPhysicalNewline =
          text[lineEnd] === "\n" ||
          (text[lineEnd] === "\r" && text[lineEnd + 1] === "\n");
        const argument = scanShellCommandSyntax(
          text,
          commandOffset,
          lineEnd,
          hasPhysicalNewline,
          syntaxProfile,
        );
        continuedOpaqueArgument = argument.consumesFollowingTextLine;
        break;
      }

      if (kind === "label") {
        const argument = addLabel(
          commandCharacter.value,
          commandOffset,
          lineEnd,
        );
        if (argument.nextCommandOffset === null) {
          break;
        }
        commandSearchOffset = argument.nextCommandOffset;
        continue;
      }

      if (kind === "version") {
        const argument = scanVersionArgumentSyntax(
          text,
          commandOffset,
          lineEnd,
          syntaxProfile,
        );
        if (argument.nextCommandOffset === null) {
          break;
        }
        commandSearchOffset = argument.nextCommandOffset;
        continue;
      }

      if (kind === "substitute") {
        const result = scanSubstitute(
          text,
          commandOffset,
          lineEnd,
          blockDepth > 0,
          syntaxProfile,
        );
        consumedUntil = Math.max(consumedUntil, result.consumedUntil);
        if (result.context !== null) {
          contexts.push(result.context);
        }

        if (result.nextCommandOffset === null) {
          break;
        }

        if (result.nextCommandOffset > lineEnd) {
          pendingCommandOffset = result.nextCommandOffset;
          break;
        }

        commandSearchOffset = result.nextCommandOffset;
        continue;
      }

      if (kind === "transliterate") {
        const commandEnd = scanTransliterate(
          text,
          commandOffset,
          lineEnd,
          syntaxProfile,
        );
        if (commandEnd === null) {
          break;
        }

        const nextCommandOffset = scanCommandEnd(
          text,
          commandEnd,
          lineEnd,
          syntaxProfile,
          { insideBlock: blockDepth > 0 },
        );
        if (nextCommandOffset === null) {
          break;
        }
        commandSearchOffset = nextCommandOffset;
        continue;
      }

      if (kind === "block-open") {
        blockDepth += 1;
        commandSearchOffset = commandOffset + commandCharacter.width;
        continue;
      }

      if (kind === "block-close") {
        if (blockDepth > 0) {
          blockDepth -= 1;
        }
      }

      const commandEnd =
        kind === "numeric"
          ? scanOptionalNumericArgumentSyntax(
              text,
              commandOffset,
              lineEnd,
              syntaxProfile,
            ).commandEndOffset
          : commandOffset + commandCharacter.width;
      const nextCommandOffset = scanCommandEnd(
        text,
        commandEnd,
        lineEnd,
        syntaxProfile,
        {
          insideBlock: blockDepth > 0,
          recoverAtClosingBrace: kind === "block-close" || blockDepth > 0,
        },
      );
      if (nextCommandOffset === null) {
        break;
      }
      commandSearchOffset = nextCommandOffset;
    }
  }

  while (lineStart <= text.length) {
    const newlineOffset = text.indexOf("\n", lineStart);
    const nextLineStart =
      newlineOffset === -1 ? text.length + 1 : newlineOffset + 1;
    let lineEnd = newlineOffset === -1 ? text.length : newlineOffset;
    if (lineEnd > lineStart && text[lineEnd - 1] === "\r") {
      lineEnd -= 1;
    }

    const resumesOnThisLine =
      pendingCommandOffset !== null &&
      pendingCommandOffset >= lineStart &&
      pendingCommandOffset <= lineEnd;

    if (resumesOnThisLine) {
      const commandOffset = pendingCommandOffset;
      pendingCommandOffset = null;
      scanLine(commandOffset, lineEnd);
    } else if (lineStart <= consumedUntil) {
      // A multiline regexp may already have scanned a command on a later
      // physical line. Do not let its intermediate lines alter argument state.
    } else if (continuedOpaqueArgument) {
      const hasPhysicalTextLine =
        newlineOffset !== -1 || lineStart < text.length;
      continuedOpaqueArgument =
        hasPhysicalTextLine &&
        newlineOffset !== -1 &&
        hasUnescapedTrailingBackslash(text, lineStart, lineEnd);
    } else {
      scanLine(lineStart, lineEnd);
    }

    if (newlineOffset === -1) {
      break;
    }
    lineStart = nextLineStart;
  }

  return {
    labelDefinitions,
    labelReferences,
    contextAt(offset) {
      if (!Number.isInteger(offset) || offset < 0 || offset > text.length) {
        return null;
      }

      for (const context of contexts) {
        if (
          context.value.kind === "command" &&
          context.startOffset === offset
        ) {
          return context.value;
        }
      }

      for (const context of contexts) {
        if (context.startOffset <= offset && offset <= context.endOffset) {
          return context.value;
        }
      }

      return null;
    },
    contextDetailsAt(offset) {
      if (!Number.isInteger(offset) || offset < 0 || offset > text.length) {
        return null;
      }

      const exactCommand = contexts.find(
        (context) =>
          context.value.kind === "command" &&
          context.startOffset === offset &&
          context.endOffset === offset,
      );
      const context =
        exactCommand ??
        contexts.find(
          (candidate) =>
            candidate.startOffset <= offset && offset <= candidate.endOffset,
        );
      if (context === undefined) {
        return null;
      }

      return {
        ...context.value,
        range: range(context.startOffset, context.endOffset),
        replacementRange: context.replacementRange ?? null,
      };
    },
  };
}

let documentStructureCache = new WeakMap();

export function invalidateDocumentStructureCache(document) {
  if (document === undefined) {
    documentStructureCache = new WeakMap();
    return;
  }

  documentStructureCache.delete(document);
}

export function getDocumentStructure(document, options = defaultSyntaxProfile) {
  const syntaxProfile = requireSyntaxProfile(options);
  let cachedProfiles = documentStructureCache.get(document);
  const cached = cachedProfiles?.get(syntaxProfile);
  if (cached?.version === document.version) {
    return cached.structure;
  }

  const structure = buildDocumentStructure(document.getText(), syntaxProfile);
  if (cachedProfiles === undefined) {
    cachedProfiles = new Map();
    documentStructureCache.set(document, cachedProfiles);
  }
  cachedProfiles.set(syntaxProfile, {
    structure,
    version: document.version,
  });
  return structure;
}
