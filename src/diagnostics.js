import { DiagnosticSeverity } from "vscode-languageserver/node";
import {
  characterAt,
  commandSpecificationsFor,
  createSubstituteFlagState,
  findInvalidReplacementControlEscape,
  findLineEnd,
  findReplacementDelimiter,
  findTransliterateDelimiter,
  hasUnescapedTrailingBackslash,
  iterateRegexpTokens,
  scanAddressSyntax,
  scanCommandEndSyntax,
  scanCommandRecoverySyntax,
  scanFilenameArgumentSyntax,
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

const SOURCE = "sed-language-server";
const DIALECT_NAME = "\0sed-dialect\0";

const messages = {
  missingDelimiter: `Expected a delimiter after the ${DIALECT_NAME} sed \`s\` command.`,
  invalidDelimiter: `A ${DIALECT_NAME} sed \`s\` command cannot use a backslash or newline as its delimiter.`,
  unterminatedPattern: `The ${DIALECT_NAME} sed substitute pattern is not terminated.`,
  unterminatedReplacement: `The ${DIALECT_NAME} sed substitute replacement is not terminated.`,
  invalidFlag: (flag) =>
    `Invalid ${DIALECT_NAME} sed substitute flag: \`${flag}\`.`,
  repeatedOccurrence:
    "A GNU sed `s` command accepts only one occurrence-number option.",
  zeroOccurrence: "A GNU sed `s` command occurrence number must not be zero.",
  repeatedSubstituteFlag: (flag) =>
    `The GNU sed \`${flag}\` substitute flag may only be specified once.`,
  missingWriteFileSeparator: `Expected a blank between the ${DIALECT_NAME} sed \`w\` flag and its filename.`,
  missingWriteFile: `Expected a filename after the ${DIALECT_NAME} sed substitute \`w\` flag.`,
  missingFileSeparator: (command) =>
    `Expected a blank between the ${DIALECT_NAME} sed \`${command}\` command and its filename.`,
  missingFile: (command) =>
    `Expected a filename after the ${DIALECT_NAME} sed \`${command}\` command.`,
  missingLabel: `Expected a label after the ${DIALECT_NAME} sed \`:\` command.`,
  missingLabelSeparator: (command) =>
    `Expected a space between the ${DIALECT_NAME} sed \`${command}\` command and its label.`,
  unexpectedClosingBrace: `This ${DIALECT_NAME} sed closing brace has no matching opening brace.`,
  missingClosingBraceSeparator: `Expected a newline or semicolon before this ${DIALECT_NAME} sed closing brace.`,
  unclosedOpeningBrace: `This ${DIALECT_NAME} sed opening brace is not closed.`,
  missingTransliterateDelimiter: `Expected a delimiter after the ${DIALECT_NAME} sed \`y\` command.`,
  invalidTransliterateDelimiter: `A ${DIALECT_NAME} sed \`y\` command cannot use a backslash or newline as its delimiter.`,
  unterminatedFirstTransliterateString: `The first string in this ${DIALECT_NAME} sed \`y\` command is not terminated.`,
  unterminatedSecondTransliterateString: `The second string in this ${DIALECT_NAME} sed \`y\` command is not terminated.`,
  missingContextAddressDelimiter: `Expected a delimiter after the backslash in this ${DIALECT_NAME} sed context address.`,
  invalidContextAddressDelimiter: `A ${DIALECT_NAME} sed context address cannot use a backslash or newline as its delimiter.`,
  unterminatedContextAddress: `This ${DIALECT_NAME} sed context address is not terminated.`,
  relativeAddressFirst:
    "A GNU sed `+N` or `~N` address can only be the second address in a range.",
  missingRangeAddress:
    "Expected an address after this comma in a GNU sed address range.",
  emptyRegexpModifiers:
    "GNU sed regexp modifiers cannot be used with an empty regexp.",
  emptySubstituteRegexpModifiers:
    "GNU sed substitute regexp modifiers cannot be used with an empty regexp.",
  invalidZeroAddress: "GNU sed line address 0 is not valid in this context.",
  invalidRegexpBackReference: (regexpMode, number) =>
    `The ${DIALECT_NAME} ${regexpMode.toUpperCase()} back-reference \`\\${number}\` does not refer to a preceding subexpression.`,
  invalidControlEscape:
    "GNU sed does not allow recursive escaping after `\\c`.",
  unclosedRegexpBracket: `The ${DIALECT_NAME} sed regular expression has an unmatched \`[\`.`,
  missingCommand: `Expected a ${DIALECT_NAME} sed command.`,
  unknownCommand: (command) =>
    `Unknown ${DIALECT_NAME} sed command: \`${command}\`.`,
  unexpectedCommandText: (command) =>
    `Unexpected text after the ${DIALECT_NAME} sed \`${command}\` command.`,
  missingTextBackslash: (command) =>
    `Expected a backslash immediately after the ${DIALECT_NAME} sed \`${command}\` command.`,
  unexpectedTextAfterTextBackslash: (command) =>
    `Unexpected text after the backslash in the ${DIALECT_NAME} sed \`${command}\` command.`,
  missingTextNewline: (command) =>
    `Expected a newline after the backslash in the ${DIALECT_NAME} sed \`${command}\` command.`,
  missingTextLine: (command) =>
    `Expected a line of text for the ${DIALECT_NAME} sed \`${command}\` command.`,
  missingTextArgument: (command) =>
    `Expected text or a backslash after the ${DIALECT_NAME} sed \`${command}\` command.`,
  unsupportedVersion: (requiredVersion) =>
    `The GNU sed 4.10 target does not satisfy the required version \`${requiredVersion}\`.`,
  tooManyAddressesBeforeCommand: `A ${DIALECT_NAME} sed command accepts at most two addresses.`,
  emptyCommandHasAddresses: `An empty ${DIALECT_NAME} sed command does not accept addresses.`,
  tooManyAddresses: (command, maximum) => {
    if (maximum === 0) {
      return `The ${DIALECT_NAME} sed \`${command}\` command does not accept addresses.`;
    }

    const count = maximum === 1 ? "one address" : "two addresses";
    return `The ${DIALECT_NAME} sed \`${command}\` command accepts at most ${count}.`;
  },
};

function renderMessage(message, syntaxProfile) {
  const dialectName = syntaxProfile.dialect === "gnu" ? "GNU" : "POSIX";
  return message.replaceAll(DIALECT_NAME, dialectName);
}

function findRegexpProblems(text, offset, end, delimiter, syntaxProfile) {
  if (syntaxProfile.dialect === "posix" && syntaxProfile.regexpMode === "ere") {
    return [];
  }

  let nextSubexpression = 1;
  let subexpressionDepth = 0;
  const trackedSubexpressionsByDepth = new Map();
  const closedSubexpressions = new Set();
  const problems = [];

  for (const token of iterateRegexpTokens(
    text,
    offset,
    end,
    delimiter,
    syntaxProfile,
  )) {
    if (token.kind === "invalid-control-escape") {
      problems.push(
        issue(
          "regexp-invalid-control-escape",
          messages.invalidControlEscape,
          token.offset,
          token.endOffset,
        ),
      );
    } else if (token.kind === "unclosed-bracket-expression") {
      problems.push(
        issue(
          "regexp-unclosed-bracket-expression",
          messages.unclosedRegexpBracket,
          token.offset,
          token.endOffset,
        ),
      );
    } else if (token.kind === "subexpression-open") {
      subexpressionDepth += 1;
      if (nextSubexpression <= 9) {
        trackedSubexpressionsByDepth.set(subexpressionDepth, nextSubexpression);
      }
      nextSubexpression += 1;
    } else if (token.kind === "subexpression-close") {
      const subexpression =
        trackedSubexpressionsByDepth.get(subexpressionDepth);
      if (subexpression !== undefined) {
        closedSubexpressions.add(subexpression);
        trackedSubexpressionsByDepth.delete(subexpressionDepth);
      }
      subexpressionDepth = Math.max(0, subexpressionDepth - 1);
    } else if (
      token.kind === "back-reference" &&
      !closedSubexpressions.has(Number(token.value))
    ) {
      problems.push(
        issue(
          `${syntaxProfile.regexpMode}-invalid-back-reference`,
          messages.invalidRegexpBackReference(
            syntaxProfile.regexpMode,
            token.value,
          ),
          token.offset,
          token.endOffset,
        ),
      );
    }
  }

  return problems;
}

const commandDefinitionsByProfile = new Map();

function commandDefinitionsFor(syntaxProfile) {
  let definitions = commandDefinitionsByProfile.get(syntaxProfile);
  if (definitions !== undefined) {
    return definitions;
  }

  definitions = new Map(
    commandSpecificationsFor(syntaxProfile).map(
      ({ command, kind, maximumAddresses }) => [
        command,
        { kind, maximumAddresses },
      ],
    ),
  );
  commandDefinitionsByProfile.set(syntaxProfile, definitions);
  return definitions;
}

function scanAddress(text, offset, end, syntaxProfile) {
  const result = scanAddressSyntax(text, offset, end, syntaxProfile);
  if (result.kind === "none") {
    return result;
  }

  if (result.kind === "indeterminate") {
    return {
      endOffset: result.endOffset ?? end,
      kind: "invalid",
      problem: null,
    };
  }

  if (result.kind === "invalid") {
    if (result.reason === "missing-delimiter") {
      return {
        endOffset: result.endOffset ?? result.delimiterOffset ?? end,
        kind: "invalid",
        problem: issue(
          "address-missing-delimiter",
          messages.missingContextAddressDelimiter,
          offset,
          offset + 1,
        ),
      };
    }

    if (result.reason === "invalid-delimiter") {
      return {
        endOffset: result.endOffset ?? result.delimiterOffset ?? end,
        kind: "invalid",
        problem: issue(
          "address-invalid-delimiter",
          messages.invalidContextAddressDelimiter,
          result.delimiterOffset,
          result.delimiterOffset + (result.delimiter?.width ?? 1),
        ),
      };
    }

    return {
      endOffset: result.endOffset ?? result.delimiterOffset ?? end,
      kind: "invalid",
      problem: issue(
        "address-unterminated-context",
        messages.unterminatedContextAddress,
        offset,
        result.endOffset ?? end,
      ),
    };
  }

  const addressProblems = [];

  if (
    result.addressKind === "regular-expression" &&
    result.value === "" &&
    result.modifiers.length > 0
  ) {
    addressProblems.push(
      issue(
        "address-empty-regexp-modifiers",
        messages.emptyRegexpModifiers,
        result.modifiers[0].startOffset,
        result.modifiers.at(-1).endOffset,
      ),
    );
  }

  return {
    kind: "valid",
    addressProblems,
    addressKind: result.addressKind,
    endOffset: result.endOffset,
    modifiers: result.modifiers,
    startOffset: result.startOffset,
    value: result.value,
    regexpProblems:
      result.addressKind !== "regular-expression" || result.isUndefined
        ? []
        : findRegexpProblems(
            text,
            result.patternStartOffset,
            result.patternEndOffset,
            result.delimiter,
            syntaxProfile,
          ),
  };
}

function isZeroDecimal(value) {
  if (value === "") {
    return false;
  }

  for (const digit of value) {
    if (digit !== "0") {
      return false;
    }
  }
  return true;
}

function addressUsageProblems(
  addresses,
  command,
  hasOmittedAddress,
  negationOffset,
  syntaxProfile,
) {
  if (syntaxProfile.dialect !== "gnu") {
    return [];
  }

  const problems = [];
  const firstAddress = addresses[0];
  // GNU sed represents an omitted or zero relative value as a null address.
  // Only a positive relative value is invalid in the first position.
  if (
    firstAddress !== undefined &&
    (firstAddress.addressKind === "relative-line-count" ||
      firstAddress.addressKind === "relative-line-multiple") &&
    firstAddress.value !== null &&
    !isZeroDecimal(firstAddress.value)
  ) {
    problems.push(
      issue(
        "address-relative-first",
        messages.relativeAddressFirst,
        firstAddress.startOffset,
        firstAddress.endOffset,
      ),
    );
  }

  if (firstAddress === undefined) {
    return problems;
  }

  const firstLineNumber =
    firstAddress.addressKind === "line-number"
      ? firstAddress.value
      : firstAddress.addressKind === "line-number-step"
        ? firstAddress.value.first
        : null;
  if (firstLineNumber === null || !isZeroDecimal(firstLineNumber)) {
    return problems;
  }

  const hasPositiveStep =
    firstAddress.addressKind === "line-number-step" &&
    firstAddress.value.step !== null &&
    !isZeroDecimal(firstAddress.value.step);
  const isZeroRegexpRange = addresses[1]?.addressKind === "regular-expression";
  const isStandaloneRead =
    addresses.length === 1 &&
    !hasOmittedAddress &&
    negationOffset === null &&
    command === "r";
  if (!hasPositiveStep && !isZeroRegexpRange && !isStandaloneRead) {
    problems.push(
      issue(
        "address-zero-invalid",
        messages.invalidZeroAddress,
        firstAddress.startOffset,
        firstAddress.endOffset,
      ),
    );
  }

  return problems;
}

function findCommand(text, lineStart, lineEnd, syntaxProfile) {
  const policy = syntaxPolicyFor(syntaxProfile);
  const addressScanEnd = policy.regexp.escapedPhysicalNewlines
    ? text.length
    : lineEnd;
  let cursor = skipBlanks(text, lineStart, lineEnd);
  let problem = null;
  let negationOffset = null;
  let hasOmittedAddress = false;
  const addresses = [];
  const addressProblems = [];
  const regexpProblems = [];

  if (text[cursor] === ",") {
    if (syntaxProfile.dialect === "gnu") {
      problem = issue(
        "address-range-missing",
        messages.missingRangeAddress,
        cursor,
        cursor + 1,
      );
    } else {
      hasOmittedAddress = true;
    }
    cursor = skipBlanks(text, cursor + 1, lineEnd);
  }

  const firstAddress = scanAddress(text, cursor, addressScanEnd, syntaxProfile);

  if (firstAddress.kind === "invalid") {
    if (firstAddress.endOffset > lineEnd) {
      lineEnd = findLineEnd(text, firstAddress.endOffset);
    }
    return {
      addressProblems,
      addresses,
      regexpProblems,
      commandOffset: null,
      hasOmittedAddress: hasOmittedAddress || firstAddress.problem === null,
      lineEnd,
      negationOffset,
      problem: hasOmittedAddress ? null : firstAddress.problem,
      resumeOffset: null,
    };
  }

  if (firstAddress.kind === "valid") {
    addressProblems.push(...firstAddress.addressProblems);
    regexpProblems.push(...(firstAddress.regexpProblems ?? []));
    addresses.push({
      addressKind: firstAddress.addressKind,
      endOffset: firstAddress.endOffset,
      modifiers: firstAddress.modifiers,
      startOffset: firstAddress.startOffset,
      value: firstAddress.value,
    });
    if (firstAddress.endOffset > lineEnd) {
      lineEnd = findLineEnd(text, firstAddress.endOffset);
    }
    cursor = skipBlanks(text, firstAddress.endOffset, lineEnd);

    while (text[cursor] === ",") {
      const commaOffset = cursor;
      cursor = skipBlanks(text, commaOffset + 1, lineEnd);
      const nextAddress = scanAddress(
        text,
        cursor,
        addressScanEnd,
        syntaxProfile,
      );

      if (nextAddress.kind === "invalid") {
        if (nextAddress.endOffset > lineEnd) {
          lineEnd = findLineEnd(text, nextAddress.endOffset);
        }
        if (addresses.length >= 2) {
          return {
            addressProblems,
            addresses,
            regexpProblems,
            commandOffset: null,
            hasOmittedAddress,
            lineEnd,
            negationOffset,
            problem: issue(
              "address-too-many",
              messages.tooManyAddressesBeforeCommand,
              commaOffset,
              commaOffset + 1,
            ),
            resumeOffset: null,
          };
        }

        return {
          addressProblems,
          addresses,
          regexpProblems,
          commandOffset: null,
          hasOmittedAddress: hasOmittedAddress || nextAddress.problem === null,
          lineEnd,
          negationOffset,
          problem: nextAddress.problem,
          resumeOffset: null,
        };
      }

      if (nextAddress.kind === "none") {
        if (addresses.length >= 2) {
          problem = issue(
            "address-too-many",
            messages.tooManyAddressesBeforeCommand,
            commaOffset,
            commaOffset + 1,
          );
        } else if (syntaxProfile.dialect === "gnu") {
          problem = issue(
            "address-range-missing",
            messages.missingRangeAddress,
            commaOffset,
            commaOffset + 1,
          );
        } else {
          hasOmittedAddress = true;
        }

        if (text[cursor] === ";") {
          return {
            addressProblems,
            addresses,
            regexpProblems,
            commandOffset: null,
            hasOmittedAddress,
            lineEnd,
            negationOffset,
            problem,
            resumeOffset: skipEmptyCommands(text, cursor, lineEnd),
          };
        }

        break;
      }

      addressProblems.push(...nextAddress.addressProblems);
      addresses.push({
        addressKind: nextAddress.addressKind,
        endOffset: nextAddress.endOffset,
        modifiers: nextAddress.modifiers,
        startOffset: nextAddress.startOffset,
        value: nextAddress.value,
      });
      if (nextAddress.endOffset > lineEnd) {
        lineEnd = findLineEnd(text, nextAddress.endOffset);
      }
      regexpProblems.push(...(nextAddress.regexpProblems ?? []));
      cursor = skipBlanks(text, nextAddress.endOffset, lineEnd);
    }
  }

  if (text[cursor] === "!") {
    negationOffset = cursor;
    cursor = skipBlanks(text, cursor + 1, lineEnd);
  }

  const commandOffset = cursor < lineEnd ? cursor : null;
  if (problem === null) {
    addressProblems.push(
      ...addressUsageProblems(
        addresses,
        commandOffset === null ? null : text[commandOffset],
        hasOmittedAddress,
        negationOffset,
        syntaxProfile,
      ),
    );
  }

  return {
    addressProblems,
    addresses,
    regexpProblems,
    commandOffset,
    hasOmittedAddress,
    lineEnd,
    negationOffset,
    problem,
    resumeOffset: null,
  };
}

function diagnoseTextCommand(
  text,
  commandOffset,
  lineEnd,
  hasPhysicalNewline,
  syntaxProfile,
) {
  const command = text[commandOffset];
  const result = scanTextCommandSyntax(
    text,
    commandOffset,
    lineEnd,
    hasPhysicalNewline,
    syntaxProfile,
  );
  let problem = null;

  if (result.kind === "invalid") {
    if (result.reason === "missing-backslash") {
      problem = issue(
        "text-missing-backslash",
        messages.missingTextBackslash(command),
        result.startOffset,
        result.endOffset,
      );
    } else if (result.reason === "unexpected-after-backslash") {
      problem = issue(
        "text-unexpected-after-backslash",
        messages.unexpectedTextAfterTextBackslash(command),
        result.startOffset,
        result.endOffset,
      );
    } else if (result.reason === "missing-newline") {
      problem = issue(
        "text-missing-newline",
        messages.missingTextNewline(command),
        result.startOffset,
        result.endOffset,
      );
    } else {
      problem = issue(
        "text-missing-argument",
        messages.missingTextArgument(command),
        result.startOffset,
        result.endOffset,
      );
    }
  }

  if (!result.consumesFollowingTextLine) {
    return { problem, textArgument: null };
  }

  return {
    problem,
    textArgument: {
      allowsMissingLine: result.allowsMissingFollowingTextLine ?? false,
      command,
      expectedLineOffset:
        result.backslashOffset ?? Math.max(commandOffset, lineEnd - 1),
    },
  };
}

function scanShellCommand(
  text,
  commandOffset,
  lineEnd,
  hasPhysicalNewline,
  syntaxProfile,
) {
  const result = scanShellCommandSyntax(
    text,
    commandOffset,
    lineEnd,
    hasPhysicalNewline,
    syntaxProfile,
  );
  if (!result.consumesFollowingTextLine) {
    return null;
  }

  return {
    allowsMissingLine: true,
    command: text[commandOffset],
    expectedLineOffset: Math.max(commandOffset, lineEnd - 1),
  };
}

function diagnoseFileCommand(text, commandOffset, lineEnd, syntaxProfile) {
  const command = text[commandOffset];
  const argument = scanFilenameArgumentSyntax(
    text,
    commandOffset,
    lineEnd,
    syntaxProfile,
  );
  const problemKind = !argument.hasName
    ? "missing-name"
    : argument.hasValidSeparator
      ? null
      : "missing-separator";
  if (problemKind === null) {
    return null;
  }

  const codePrefix = command.toLowerCase() === "r" ? "read-file" : "write-file";
  return issue(
    `${codePrefix}-${problemKind}`,
    problemKind === "missing-name"
      ? messages.missingFile(command)
      : messages.missingFileSeparator(command),
    commandOffset,
    commandOffset + 1,
  );
}

function diagnoseLabelCommand(
  text,
  commandOffset,
  lineEnd,
  insideBlock,
  syntaxProfile,
) {
  const command = text[commandOffset];
  const policy = syntaxPolicyFor(syntaxProfile);
  const argument = scanLabelArgumentSyntax(
    text,
    commandOffset,
    lineEnd,
    syntaxProfile,
  );
  let problem = null;

  if (!argument.hasLabel) {
    if (command === ":") {
      problem = issue(
        "label-missing",
        messages.missingLabel,
        commandOffset,
        commandOffset + 1,
      );
    } else if (
      insideBlock &&
      policy.commandEnd.rejectsTrailingBlanksInBlock &&
      argument.fieldStartOffset < lineEnd
    ) {
      problem = issue(
        "command-unexpected-text",
        messages.unexpectedCommandText(command),
        argument.fieldStartOffset,
        lineEnd,
      );
    }
  } else if (command !== ":" && !argument.hasValidSeparator) {
    const codePrefix = command === "b" ? "branch-label" : "test-label";
    problem = issue(
      `${codePrefix}-missing-separator`,
      messages.missingLabelSeparator(command),
      commandOffset,
      commandOffset + 1,
    );
  }

  return {
    problem,
    nextCommandBoundary: argument.nextCommandBoundary,
    nextCommandOffset: argument.nextCommandOffset,
  };
}

function diagnoseVersionCommand(text, commandOffset, lineEnd, syntaxProfile) {
  const argument = scanVersionArgumentSyntax(
    text,
    commandOffset,
    lineEnd,
    syntaxProfile,
  );

  return {
    problem: argument.isSupported
      ? null
      : issue(
          "version-requires-newer-sed",
          messages.unsupportedVersion(argument.comparedVersion),
          argument.startOffset,
          argument.endOffset,
        ),
    nextCommandBoundary: argument.nextCommandBoundary,
    nextCommandOffset: argument.nextCommandOffset,
  };
}

function scanEmptyCommands(text, offset, lineEnd, boundary = "direct") {
  let cursor = offset;
  let nextBoundary = boundary;

  while (cursor < lineEnd) {
    cursor = skipBlanks(text, cursor, lineEnd);
    if (text[cursor] !== ";") {
      break;
    }
    nextBoundary = "separated";
    cursor += 1;
  }

  return {
    boundary: nextBoundary,
    offset: skipBlanks(text, cursor, lineEnd),
  };
}

function skipEmptyCommands(text, offset, lineEnd) {
  return scanEmptyCommands(text, offset, lineEnd).offset;
}

function diagnoseCommandEnd(
  text,
  command,
  commandEnd,
  lineEnd,
  syntaxProfile,
  state = {},
) {
  const result = scanCommandEndSyntax(
    text,
    commandEnd,
    lineEnd,
    syntaxProfile,
    state,
  );
  return {
    problem:
      result.kind === "unexpected"
        ? issue(
            "command-unexpected-text",
            messages.unexpectedCommandText(command),
            result.startOffset,
            result.endOffset,
          )
        : null,
    nextCommandOffset: result.nextCommandOffset,
    nextCommandBoundary: result.nextCommandBoundary,
  };
}

function simpleCommandEnd(
  text,
  command,
  commandOffset,
  lineEnd,
  syntaxProfile,
  state = {},
) {
  return diagnoseCommandEnd(
    text,
    command,
    commandOffset + 1,
    lineEnd,
    syntaxProfile,
    state,
  );
}

function diagnoseTransliterate(
  text,
  commandOffset,
  lineEnd,
  recoverAtClosingBrace,
  syntaxProfile,
) {
  const delimiterOffset = commandOffset + 1;
  if (delimiterOffset >= lineEnd) {
    return {
      problem: issue(
        "transliterate-missing-delimiter",
        messages.missingTransliterateDelimiter,
        commandOffset,
        commandOffset + 1,
      ),
      nextCommandOffset: null,
    };
  }

  const delimiter = characterAt(text, delimiterOffset);
  if (
    delimiter === null ||
    delimiter.value === "\\" ||
    delimiter.value === "\n"
  ) {
    return {
      problem: issue(
        "transliterate-invalid-delimiter",
        messages.invalidTransliterateDelimiter,
        delimiterOffset,
        delimiterOffset + (delimiter?.width ?? 1),
      ),
      nextCommandOffset: null,
    };
  }

  const firstStringEnd = findTransliterateDelimiter(
    text,
    delimiterOffset + delimiter.width,
    lineEnd,
    delimiter,
    syntaxProfile,
  );
  if (firstStringEnd === null) {
    return {
      problem: issue(
        "transliterate-unterminated-first-string",
        messages.unterminatedFirstTransliterateString,
        commandOffset,
        lineEnd,
      ),
      nextCommandOffset: null,
    };
  }

  const secondStringEnd = findTransliterateDelimiter(
    text,
    firstStringEnd + delimiter.width,
    lineEnd,
    delimiter,
    syntaxProfile,
  );
  if (secondStringEnd === null) {
    return {
      problem: issue(
        "transliterate-unterminated-second-string",
        messages.unterminatedSecondTransliterateString,
        commandOffset,
        lineEnd,
      ),
      nextCommandOffset: null,
    };
  }

  const commandEnd = secondStringEnd + delimiter.width;
  return diagnoseCommandEnd(text, "y", commandEnd, lineEnd, syntaxProfile, {
    insideBlock: recoverAtClosingBrace,
    recoverAtClosingBrace,
  });
}

function scanSubstituteFlags(
  text,
  offset,
  lineEnd,
  recoverAtClosingBrace,
  syntaxProfile,
) {
  const policy = syntaxPolicyFor(syntaxProfile);
  const canRecoverAtClosingBrace =
    recoverAtClosingBrace || policy.commandEnd.closingBraceTerminates;
  let cursor = offset;
  let flagState = createSubstituteFlagState();
  const flags = [];
  const regexpModifiers = [];

  function result(fields) {
    return { flagState, flags, regexpModifiers, ...fields };
  }

  while (cursor < lineEnd) {
    const character = characterAt(text, cursor);
    if (character === null) {
      break;
    }

    if (character.value === ";") {
      return result({
        problem: null,
        consumedUntil: cursor + character.width,
        nextCommandOffset: cursor + character.width,
        nextCommandBoundary: "separated",
      });
    }

    if (policy.commandEnd.commentTerminates && character.value === "#") {
      return result({
        problem: null,
        consumedUntil: lineEnd,
        nextCommandOffset: null,
        nextCommandBoundary: null,
      });
    }

    if (canRecoverAtClosingBrace && character.value === "}") {
      return result({
        problem: null,
        consumedUntil: lineEnd,
        nextCommandOffset: cursor,
        nextCommandBoundary: "direct",
      });
    }

    if (
      policy.substituteFlags.separator === "optional-blanks" &&
      (character.value === " " || character.value === "\t")
    ) {
      cursor = skipBlanks(text, cursor, lineEnd);
      continue;
    }

    if (
      recoverAtClosingBrace &&
      (character.value === " " || character.value === "\t")
    ) {
      const argumentOffset = skipBlanks(text, cursor, lineEnd);
      if (text[argumentOffset] === "}") {
        return result({
          problem: null,
          consumedUntil: lineEnd,
          nextCommandOffset: argumentOffset,
          nextCommandBoundary: "direct",
        });
      }

      if (argumentOffset >= lineEnd || text[argumentOffset] === ";") {
        return result({
          problem: issue(
            "command-unexpected-text",
            messages.unexpectedCommandText("s"),
            cursor,
            argumentOffset,
          ),
          consumedUntil: lineEnd,
          nextCommandOffset:
            argumentOffset >= lineEnd ? null : argumentOffset + 1,
          nextCommandBoundary: argumentOffset >= lineEnd ? null : "separated",
        });
      }
    }

    const token = scanSubstituteFlagTokenSyntax(
      text,
      cursor,
      lineEnd,
      flagState,
      syntaxProfile,
    );
    if (token.kind === "flag" || token.kind === "occurrence") {
      flags.push({
        endOffset: token.endOffset,
        kind: token.kind,
        startOffset: token.startOffset,
        value: token.value,
      });
      if (token.kind === "flag" && ["i", "I", "m", "M"].includes(token.value)) {
        regexpModifiers.push({
          endOffset: token.endOffset,
          startOffset: token.startOffset,
          value: token.value,
        });
      }
      flagState = token.state;
      cursor = token.endOffset;
      continue;
    }

    if (token.kind === "write") {
      const filename = scanFilenameArgumentSyntax(
        text,
        cursor,
        lineEnd,
        syntaxProfile,
      );
      const filenameProblem = !filename.hasName
        ? "missing-name"
        : filename.hasValidSeparator
          ? null
          : "missing-separator";
      if (filenameProblem !== null) {
        return result({
          problem: issue(
            `substitute-write-file-${filenameProblem}`,
            filenameProblem === "missing-name"
              ? messages.missingWriteFile
              : messages.missingWriteFileSeparator,
            cursor,
            cursor + character.width,
          ),
          consumedUntil: lineEnd,
          nextCommandOffset: null,
          nextCommandBoundary: null,
        });
      }

      return result({
        problem: null,
        consumedUntil: lineEnd,
        nextCommandOffset: null,
        nextCommandBoundary: null,
      });
    }

    const recovery = scanCommandRecoverySyntax(
      text,
      token.endOffset,
      lineEnd,
      syntaxProfile,
      { recoverAtClosingBrace: canRecoverAtClosingBrace },
    );
    const problem =
      syntaxProfile.dialect === "gnu" && token.reason === "repeated-occurrence"
        ? issue(
            "substitute-occurrence-repeated",
            messages.repeatedOccurrence,
            token.startOffset,
            token.endOffset,
          )
        : syntaxProfile.dialect === "gnu" && token.reason === "zero-occurrence"
          ? issue(
              "substitute-occurrence-zero",
              messages.zeroOccurrence,
              token.startOffset,
              token.endOffset,
            )
          : syntaxProfile.dialect === "gnu" &&
              (token.reason === "repeated-global" ||
                token.reason === "repeated-print")
            ? issue(
                "substitute-flag-repeated",
                messages.repeatedSubstituteFlag(token.value),
                token.startOffset,
                token.endOffset,
              )
            : issue(
                "substitute-invalid-flag",
                messages.invalidFlag(token.value),
                token.startOffset,
                token.endOffset,
              );
    return result({
      problem,
      consumedUntil: lineEnd,
      nextCommandOffset: recovery.nextCommandOffset,
      nextCommandBoundary: recovery.nextCommandBoundary,
    });
  }

  return result({
    problem: null,
    consumedUntil: lineEnd,
    nextCommandOffset: null,
    nextCommandBoundary: null,
  });
}

function issue(code, message, startOffset, endOffset) {
  return {
    code,
    message,
    startOffset,
    endOffset: Math.max(startOffset + 1, endOffset),
  };
}

function diagnoseSubstitute(
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
      problem: issue(
        "substitute-missing-delimiter",
        messages.missingDelimiter,
        commandOffset,
        commandOffset + 1,
      ),
      consumedUntil: lineEnd,
      nextCommandOffset: null,
    };
  }

  const delimiter = characterAt(text, delimiterOffset);
  if (delimiter === null || delimiter.value === "\\") {
    return {
      problem: issue(
        "substitute-invalid-delimiter",
        messages.invalidDelimiter,
        delimiterOffset,
        delimiterOffset + (delimiter?.width ?? 1),
      ),
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
    if (
      syntaxProfile.dialect === "posix" &&
      (pattern.hasUnclosedBracketExpression ||
        pattern.isDelimiterInterpretationUnspecified)
    ) {
      return {
        problem: null,
        consumedUntil: lineEnd,
        nextCommandOffset: null,
      };
    }

    const failureOffset =
      pattern.failureOffset ??
      (policy.regexp.escapedPhysicalNewlines ? text.length : lineEnd);
    return {
      problem: issue(
        "substitute-unterminated-pattern",
        messages.unterminatedPattern,
        commandOffset,
        failureOffset,
      ),
      consumedUntil: failureOffset,
      nextCommandOffset: null,
    };
  }

  const patternProblems =
    pattern.closingOffset === null
      ? []
      : findRegexpProblems(
          text,
          delimiterOffset + delimiter.width,
          patternEnd,
          delimiter,
          syntaxProfile,
        );
  const replacement = findReplacementDelimiter(
    text,
    patternEnd + delimiter.width,
    delimiter,
    syntaxProfile,
  );
  if (replacement.closingOffset === null) {
    return {
      problem: issue(
        "substitute-unterminated-replacement",
        messages.unterminatedReplacement,
        commandOffset,
        replacement.failureOffset,
      ),
      consumedUntil: replacement.failureOffset,
      nextCommandOffset: null,
    };
  }

  const invalidReplacementControlEscape = findInvalidReplacementControlEscape(
    text,
    patternEnd + delimiter.width,
    replacement.closingOffset,
    delimiter,
    syntaxProfile,
  );
  const flagsOffset = replacement.closingOffset + delimiter.width;
  const flagsLineEnd =
    flagsOffset <= lineEnd ? lineEnd : findLineEnd(text, flagsOffset);
  const result = scanSubstituteFlags(
    text,
    flagsOffset,
    flagsLineEnd,
    recoverAtClosingBrace,
    syntaxProfile,
  );
  if (invalidReplacementControlEscape !== null) {
    return {
      ...result,
      problem: issue(
        "replacement-invalid-control-escape",
        messages.invalidControlEscape,
        invalidReplacementControlEscape.startOffset,
        invalidReplacementControlEscape.endOffset,
      ),
      regexpProblems: patternProblems,
    };
  }

  if (
    result.problem === null &&
    syntaxProfile.dialect === "gnu" &&
    patternEnd === delimiterOffset + delimiter.width &&
    result.regexpModifiers.length > 0
  ) {
    return {
      ...result,
      problem: issue(
        "substitute-empty-regexp-modifiers",
        messages.emptySubstituteRegexpModifiers,
        result.regexpModifiers[0].startOffset,
        result.regexpModifiers.at(-1).endOffset,
      ),
      regexpProblems: patternProblems,
    };
  }

  return {
    ...result,
    regexpProblems: patternProblems,
  };
}

function addressLimitProblem(command, definition, addresses) {
  if (addresses.length <= definition.maximumAddresses) {
    return null;
  }

  const firstExcessAddress = addresses[definition.maximumAddresses];
  return issue(
    "address-too-many",
    messages.tooManyAddresses(command, definition.maximumAddresses),
    firstExcessAddress.startOffset,
    firstExcessAddress.endOffset,
  );
}

function universalAddressLimitProblem(addresses) {
  if (addresses.length <= 2) {
    return null;
  }

  const firstExcessAddress = addresses[2];
  return issue(
    "address-too-many",
    messages.tooManyAddressesBeforeCommand,
    firstExcessAddress.startOffset,
    firstExcessAddress.endOffset,
  );
}

function emptyCommandAddressLimitProblem(addresses) {
  if (addresses.length === 0) {
    return null;
  }

  return issue(
    "address-too-many",
    messages.emptyCommandHasAddresses,
    addresses[0].startOffset,
    addresses[0].endOffset,
  );
}

function missingCommandProblem(command) {
  if (command.hasOmittedAddress) {
    return null;
  }

  if (command.negationOffset !== null) {
    return issue(
      "command-missing",
      messages.missingCommand,
      command.negationOffset,
      command.negationOffset + 1,
    );
  }

  const lastAddress = command.addresses.at(-1);
  if (lastAddress === undefined) {
    return null;
  }

  return issue(
    "command-missing",
    messages.missingCommand,
    lastAddress.startOffset,
    lastAddress.endOffset,
  );
}

export function analyze(text, options = defaultSyntaxProfile) {
  const syntaxProfile = requireSyntaxProfile(options);
  const syntaxPolicy = syntaxPolicyFor(syntaxProfile);
  const commandDefinitions = commandDefinitionsFor(syntaxProfile);
  const problems = [];
  const openingBraces = [];
  let lineStart = 0;
  let consumedUntil = -1;
  let continuedOpaqueArgument = null;
  let pendingCommandOffset = null;
  let pendingCommandBoundary = null;

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
    const initialCommandOffset = resumesOnThisLine
      ? pendingCommandOffset
      : lineStart;
    const initialCommandBoundary = resumesOnThisLine
      ? pendingCommandBoundary
      : "separated";
    if (resumesOnThisLine) {
      pendingCommandOffset = null;
      pendingCommandBoundary = null;
    }

    if (!resumesOnThisLine && lineStart <= consumedUntil) {
      // A multiline construct may already have scanned a later physical line.
    } else if (!resumesOnThisLine && continuedOpaqueArgument !== null) {
      const hasPhysicalTextLine =
        newlineOffset !== -1 || lineStart < text.length;
      if (!hasPhysicalTextLine) {
        if (!continuedOpaqueArgument.allowsMissingLine) {
          problems.push(
            issue(
              "text-missing-line",
              messages.missingTextLine(continuedOpaqueArgument.command),
              continuedOpaqueArgument.expectedLineOffset,
              continuedOpaqueArgument.expectedLineOffset + 1,
            ),
          );
        }
        continuedOpaqueArgument = null;
      } else if (
        newlineOffset !== -1 &&
        hasUnescapedTrailingBackslash(text, lineStart, lineEnd)
      ) {
        continuedOpaqueArgument = {
          allowsMissingLine: continuedOpaqueArgument.allowsMissingLine,
          command: continuedOpaqueArgument.command,
          expectedLineOffset: lineEnd - 1,
        };
      } else {
        continuedOpaqueArgument = null;
      }
    } else {
      const initialCommand = scanEmptyCommands(
        text,
        initialCommandOffset,
        lineEnd,
        initialCommandBoundary,
      );
      let commandSearchOffset = initialCommand.offset;
      let commandBoundary = initialCommand.boundary;

      while (commandSearchOffset < lineEnd) {
        const command = findCommand(
          text,
          commandSearchOffset,
          lineEnd,
          syntaxProfile,
        );
        if (command.lineEnd > lineEnd) {
          lineEnd = command.lineEnd;
          consumedUntil = Math.max(consumedUntil, lineEnd);
        }
        problems.push(...command.addressProblems);
        problems.push(...command.regexpProblems);

        if (command.resumeOffset !== null) {
          if (command.problem !== null) {
            problems.push(command.problem);
          }
          commandSearchOffset = command.resumeOffset;
          commandBoundary = "separated";
          continue;
        }

        const commandOffset = command.commandOffset;
        if (commandOffset === null) {
          if (command.problem !== null) {
            problems.push(command.problem);
          } else if (command.addressProblems.length === 0) {
            const addressProblem = command.hasOmittedAddress
              ? null
              : universalAddressLimitProblem(command.addresses);
            if (addressProblem !== null) {
              problems.push(addressProblem);
            } else {
              const missingProblem = missingCommandProblem(command);
              if (missingProblem !== null) {
                problems.push(missingProblem);
              }
            }
          }
          break;
        }

        const commandCharacter = characterAt(text, commandOffset);
        if (commandCharacter === null) {
          break;
        }

        if (commandCharacter.value === ";") {
          if (command.problem !== null) {
            problems.push(command.problem);
          } else if (command.negationOffset !== null) {
            const missingProblem = missingCommandProblem(command);
            if (missingProblem !== null) {
              problems.push(missingProblem);
            }
          } else if (command.addressProblems.length === 0) {
            const addressProblem = command.hasOmittedAddress
              ? null
              : emptyCommandAddressLimitProblem(command.addresses);
            if (addressProblem !== null) {
              problems.push(addressProblem);
            }
          }
          const nextCommand = scanEmptyCommands(
            text,
            commandOffset,
            lineEnd,
            commandBoundary,
          );
          commandSearchOffset = nextCommand.offset;
          commandBoundary = nextCommand.boundary;
          continue;
        }

        const closesAfterMissingCommand =
          commandCharacter.value === "}" && command.negationOffset !== null;
        if (closesAfterMissingCommand) {
          if (command.problem !== null) {
            problems.push(command.problem);
          } else {
            const missingProblem = missingCommandProblem(command);
            if (missingProblem !== null) {
              problems.push(missingProblem);
            }
          }
        }

        const definition = commandDefinitions.get(commandCharacter.value);
        if (definition === undefined) {
          if (command.problem !== null) {
            problems.push(command.problem);
          } else {
            const addressProblem = command.hasOmittedAddress
              ? null
              : universalAddressLimitProblem(command.addresses);
            if (addressProblem !== null) {
              problems.push(addressProblem);
            }
            problems.push(
              issue(
                "command-unknown",
                messages.unknownCommand(commandCharacter.value),
                commandOffset,
                commandOffset + commandCharacter.width,
              ),
            );
          }

          const recovery = scanCommandRecoverySyntax(
            text,
            commandOffset + commandCharacter.width,
            lineEnd,
            syntaxProfile,
            { recoverAtClosingBrace: openingBraces.length > 0 },
          );
          if (recovery.nextCommandOffset === null) {
            break;
          }

          const nextCommand = scanEmptyCommands(
            text,
            recovery.nextCommandOffset,
            lineEnd,
            recovery.nextCommandBoundary,
          );
          commandSearchOffset = nextCommand.offset;
          commandBoundary = nextCommand.boundary;
          continue;
        }

        if (!closesAfterMissingCommand) {
          const addressProblem = command.hasOmittedAddress
            ? null
            : command.addressProblems.length === 0
              ? addressLimitProblem(
                  commandCharacter.value,
                  definition,
                  command.addresses,
                )
              : null;
          if (
            command.problem !== null &&
            (command.problem.code !== "address-too-many" ||
              addressProblem === null)
          ) {
            problems.push(command.problem);
          } else if (addressProblem !== null) {
            problems.push(addressProblem);
          }
        }

        if (definition.kind === "text") {
          const hasPhysicalNewline =
            text[lineEnd] === "\n" ||
            (text[lineEnd] === "\r" && text[lineEnd + 1] === "\n");
          const result = diagnoseTextCommand(
            text,
            commandOffset,
            lineEnd,
            hasPhysicalNewline,
            syntaxProfile,
          );
          if (result.problem !== null) {
            problems.push(result.problem);
          }
          continuedOpaqueArgument = result.textArgument;
          break;
        } else if (definition.kind === "shell") {
          const hasPhysicalNewline =
            text[lineEnd] === "\n" ||
            (text[lineEnd] === "\r" && text[lineEnd + 1] === "\n");
          continuedOpaqueArgument = scanShellCommand(
            text,
            commandOffset,
            lineEnd,
            hasPhysicalNewline,
            syntaxProfile,
          );
          break;
        } else if (definition.kind === "file") {
          const problem = diagnoseFileCommand(
            text,
            commandOffset,
            lineEnd,
            syntaxProfile,
          );
          if (problem !== null) {
            problems.push(problem);
          }
          break;
        } else if (definition.kind === "label") {
          const result = diagnoseLabelCommand(
            text,
            commandOffset,
            lineEnd,
            openingBraces.length > 0,
            syntaxProfile,
          );
          if (result.problem !== null) {
            problems.push(result.problem);
          }
          if (result.nextCommandOffset === null) {
            break;
          }
          const nextCommand = scanEmptyCommands(
            text,
            result.nextCommandOffset,
            lineEnd,
            result.nextCommandBoundary,
          );
          commandSearchOffset = nextCommand.offset;
          commandBoundary = nextCommand.boundary;
        } else if (definition.kind === "version") {
          const result = diagnoseVersionCommand(
            text,
            commandOffset,
            lineEnd,
            syntaxProfile,
          );
          if (result.problem !== null) {
            problems.push(result.problem);
          }
          if (result.nextCommandOffset === null) {
            break;
          }
          const nextCommand = scanEmptyCommands(
            text,
            result.nextCommandOffset,
            lineEnd,
            result.nextCommandBoundary,
          );
          commandSearchOffset = nextCommand.offset;
          commandBoundary = nextCommand.boundary;
        } else if (definition.kind === "substitute") {
          const result = diagnoseSubstitute(
            text,
            commandOffset,
            lineEnd,
            openingBraces.length > 0,
            syntaxProfile,
          );
          consumedUntil = result.consumedUntil;
          problems.push(...(result.regexpProblems ?? []));
          if (result.problem !== null) {
            problems.push(result.problem);
          }

          if (result.nextCommandOffset === null) {
            break;
          }

          if (result.nextCommandOffset > lineEnd) {
            pendingCommandOffset = result.nextCommandOffset;
            pendingCommandBoundary = result.nextCommandBoundary;
            break;
          }

          const nextCommand = scanEmptyCommands(
            text,
            result.nextCommandOffset,
            lineEnd,
            result.nextCommandBoundary,
          );
          commandSearchOffset = nextCommand.offset;
          commandBoundary = nextCommand.boundary;
        } else if (definition.kind === "block-open") {
          openingBraces.push(commandOffset);
          const nextCommand = scanEmptyCommands(
            text,
            commandOffset + 1,
            lineEnd,
            "direct",
          );
          commandSearchOffset = nextCommand.offset;
          commandBoundary = nextCommand.boundary;
        } else if (definition.kind === "block-close") {
          const hasMatchingOpeningBrace = openingBraces.length > 0;
          const hasPrimaryCommandProblem =
            command.problem !== null || command.negationOffset !== null;

          if (
            hasMatchingOpeningBrace &&
            commandBoundary === "direct" &&
            !syntaxPolicy.commandEnd.closingBraceTerminates &&
            !hasPrimaryCommandProblem
          ) {
            problems.push(
              issue(
                "block-closing-brace-missing-separator",
                messages.missingClosingBraceSeparator,
                commandOffset,
                commandOffset + 1,
              ),
            );
          }

          if (!hasMatchingOpeningBrace) {
            problems.push(
              issue(
                "block-unexpected-closing-brace",
                messages.unexpectedClosingBrace,
                commandOffset,
                commandOffset + 1,
              ),
            );
          } else {
            openingBraces.pop();
          }

          const result = simpleCommandEnd(
            text,
            commandCharacter.value,
            commandOffset,
            lineEnd,
            syntaxProfile,
            { recoverAtClosingBrace: true },
          );
          if (result.problem !== null) {
            problems.push(result.problem);
          }
          if (result.nextCommandOffset === null) {
            break;
          }
          const nextCommand = scanEmptyCommands(
            text,
            result.nextCommandOffset,
            lineEnd,
            result.nextCommandBoundary,
          );
          commandSearchOffset = nextCommand.offset;
          commandBoundary = nextCommand.boundary;
        } else if (definition.kind === "transliterate") {
          const transliterateLineEnd =
            commandOffset + 1 < lineEnd &&
            text[commandOffset + 1] === "\r" &&
            text[lineEnd] === "\r"
              ? lineEnd + 1
              : lineEnd;
          const result = diagnoseTransliterate(
            text,
            commandOffset,
            transliterateLineEnd,
            openingBraces.length > 0,
            syntaxProfile,
          );
          if (result.problem !== null) {
            problems.push(result.problem);
          }
          if (result.nextCommandOffset === null) {
            break;
          }
          const nextCommand = scanEmptyCommands(
            text,
            result.nextCommandOffset,
            lineEnd,
            result.nextCommandBoundary,
          );
          commandSearchOffset = nextCommand.offset;
          commandBoundary = nextCommand.boundary;
        } else if (
          definition.kind === "simple" ||
          definition.kind === "numeric"
        ) {
          const commandEnd =
            definition.kind === "numeric"
              ? scanOptionalNumericArgumentSyntax(
                  text,
                  commandOffset,
                  lineEnd,
                  syntaxProfile,
                ).commandEndOffset
              : commandOffset + commandCharacter.width;
          const result = diagnoseCommandEnd(
            text,
            commandCharacter.value,
            commandEnd,
            lineEnd,
            syntaxProfile,
            { insideBlock: openingBraces.length > 0 },
          );
          if (result.problem !== null) {
            problems.push(result.problem);
          }
          if (result.nextCommandOffset === null) {
            break;
          }
          const nextCommand = scanEmptyCommands(
            text,
            result.nextCommandOffset,
            lineEnd,
            result.nextCommandBoundary,
          );
          commandSearchOffset = nextCommand.offset;
          commandBoundary = nextCommand.boundary;
        } else {
          break;
        }
      }
    }

    if (newlineOffset === -1) {
      break;
    }
    lineStart = nextLineStart;
  }

  for (const openingBrace of openingBraces) {
    problems.push(
      issue(
        "block-unclosed-opening-brace",
        messages.unclosedOpeningBrace,
        openingBrace,
        openingBrace + 1,
      ),
    );
  }

  return problems.map((problem) => ({
    ...problem,
    message: renderMessage(problem.message, syntaxProfile),
  }));
}

export function createDiagnostics(document, options = defaultSyntaxProfile) {
  return analyze(document.getText(), options).map((problem) => ({
    severity: DiagnosticSeverity.Error,
    range: {
      start: document.positionAt(problem.startOffset),
      end: document.positionAt(problem.endOffset),
    },
    message: problem.message,
    code: problem.code,
    source: SOURCE,
  }));
}
