import {
  defaultSyntaxProfile,
  requireSyntaxProfile,
} from "./syntax-profile.js";

export const commandSpecifications = Object.freeze([
  {
    command: ":",
    kind: "label",
    maximumAddresses: 0,
    documentation: "Define a label for b and t branches.",
  },
  {
    command: "#",
    kind: "line",
    maximumAddresses: 0,
    documentation: "Ignore the rest of the line as a comment.",
  },
  {
    command: "}",
    kind: "block-close",
    maximumAddresses: 0,
    documentation: "End the current command block.",
  },
  {
    command: "=",
    kind: "simple",
    maximumAddresses: 1,
    documentation: "Write the current input line number.",
  },
  {
    command: "a",
    kind: "text",
    maximumAddresses: 1,
    documentation: "Queue text for output after the selected pattern space.",
  },
  {
    command: "i",
    kind: "text",
    maximumAddresses: 1,
    documentation: "Write text before the selected pattern space.",
  },
  {
    command: "q",
    kind: "simple",
    maximumAddresses: 1,
    documentation: "Quit without starting another cycle.",
  },
  {
    command: "r",
    kind: "file",
    maximumAddresses: 1,
    documentation: "Queue a file's contents for output.",
  },
  {
    command: "{",
    kind: "block-open",
    maximumAddresses: 2,
    documentation:
      "Execute a command block when its address selects the pattern space.",
  },
  {
    command: "b",
    kind: "label",
    maximumAddresses: 2,
    documentation:
      "Branch to a label, or to the end of the script when omitted.",
  },
  {
    command: "c",
    kind: "text",
    maximumAddresses: 2,
    documentation:
      "Delete the selected line or range, write text in its place, and start the next cycle.",
  },
  {
    command: "d",
    kind: "simple",
    maximumAddresses: 2,
    documentation: "Delete the pattern space and start the next cycle.",
  },
  {
    command: "D",
    kind: "simple",
    maximumAddresses: 2,
    documentation: "Delete through the first newline and restart the cycle.",
  },
  {
    command: "g",
    kind: "simple",
    maximumAddresses: 2,
    documentation: "Replace the pattern space with the hold space.",
  },
  {
    command: "G",
    kind: "simple",
    maximumAddresses: 2,
    documentation: "Append a newline and the hold space to the pattern space.",
  },
  {
    command: "h",
    kind: "simple",
    maximumAddresses: 2,
    documentation: "Replace the hold space with the pattern space.",
  },
  {
    command: "H",
    kind: "simple",
    maximumAddresses: 2,
    documentation: "Append a newline and the pattern space to the hold space.",
  },
  {
    command: "l",
    kind: "simple",
    maximumAddresses: 2,
    documentation: "Write the pattern space in a visually unambiguous form.",
  },
  {
    command: "n",
    kind: "simple",
    maximumAddresses: 2,
    documentation:
      "Write the pattern space if default output is enabled, then read the next input line.",
  },
  {
    command: "N",
    kind: "simple",
    maximumAddresses: 2,
    documentation: "Append the next input line to the pattern space.",
  },
  {
    command: "p",
    kind: "simple",
    maximumAddresses: 2,
    documentation: "Write the pattern space.",
  },
  {
    command: "P",
    kind: "simple",
    maximumAddresses: 2,
    documentation: "Write the pattern space through its first newline.",
  },
  {
    command: "s",
    kind: "substitute",
    maximumAddresses: 2,
    documentation: "Replace regular-expression matches in the pattern space.",
  },
  {
    command: "t",
    kind: "label",
    maximumAddresses: 2,
    documentation:
      "Branch if a substitution has occurred since the latest input read or t command.",
  },
  {
    command: "w",
    kind: "file",
    maximumAddresses: 2,
    documentation: "Append the pattern space to a file.",
  },
  {
    command: "x",
    kind: "simple",
    maximumAddresses: 2,
    documentation: "Exchange the pattern and hold spaces.",
  },
  {
    command: "y",
    kind: "transliterate",
    maximumAddresses: 2,
    documentation: "Transliterate characters from one set to another.",
  },
]);

const gnuCommandSpecificationOverlays = Object.freeze([
  Object.freeze({
    command: ":",
    documentation: "Define a label for b, t, and T branches.",
  }),
  Object.freeze({
    command: "=",
    maximumAddresses: 2,
  }),
  Object.freeze({
    command: "a",
    maximumAddresses: 2,
  }),
  Object.freeze({
    command: "i",
    maximumAddresses: 2,
  }),
  Object.freeze({
    command: "l",
    kind: "numeric",
  }),
  Object.freeze({
    command: "q",
    kind: "numeric",
  }),
  Object.freeze({
    command: "r",
    maximumAddresses: 2,
  }),
  Object.freeze({
    command: "t",
    documentation:
      "Branch if a substitution has occurred since the latest input read or conditional branch.",
  }),
  Object.freeze({
    command: "e",
    kind: "shell",
    maximumAddresses: 2,
    documentation:
      "Execute shell command text, or execute the pattern space when omitted.",
  }),
  Object.freeze({
    command: "F",
    kind: "simple",
    maximumAddresses: 2,
    documentation: "Write the current input filename.",
  }),
  Object.freeze({
    command: "Q",
    kind: "numeric",
    maximumAddresses: 1,
    documentation:
      "Quit without writing the pattern space, optionally returning an exit status.",
  }),
  Object.freeze({
    command: "R",
    kind: "file",
    maximumAddresses: 2,
    documentation: "Queue the next line from a file for output.",
  }),
  Object.freeze({
    command: "T",
    kind: "label",
    maximumAddresses: 2,
    documentation:
      "Branch if no substitution has occurred since the latest input read or conditional branch.",
  }),
  Object.freeze({
    command: "v",
    kind: "version",
    maximumAddresses: 2,
    documentation: "Require GNU sed, optionally at a minimum version.",
  }),
  Object.freeze({
    command: "W",
    kind: "file",
    maximumAddresses: 2,
    documentation:
      "Append the pattern space through its first newline to a file.",
  }),
  Object.freeze({
    command: "z",
    kind: "simple",
    maximumAddresses: 2,
    documentation: "Empty the pattern space.",
  }),
]);

function applySpecificationOverlays(specifications, overlays, key) {
  const merged = new Map(
    specifications.map((specification) => [specification[key], specification]),
  );
  for (const overlay of overlays) {
    const specification = merged.get(overlay[key]);
    merged.set(overlay[key], Object.freeze({ ...specification, ...overlay }));
  }
  return Object.freeze([...merged.values()]);
}

const gnuCommandSpecifications = applySpecificationOverlays(
  commandSpecifications,
  gnuCommandSpecificationOverlays,
  "command",
);

export const substituteFlagSpecifications = Object.freeze([
  {
    flag: "g",
    documentation: "Replace all non-overlapping matches.",
  },
  {
    flag: "i",
    documentation: "Match the regular expression case-insensitively.",
  },
  {
    flag: "p",
    documentation: "Write the pattern space if a replacement was made.",
  },
  {
    flag: "w",
    documentation:
      "Append the pattern space to a file if a replacement was made.",
  },
]);

const gnuSubstituteFlagSpecificationOverlays = Object.freeze([
  Object.freeze({
    flag: "e",
    documentation:
      "Evaluate the replacement as a shell command after substituting.",
  }),
  Object.freeze({
    flag: "I",
    documentation: "Match the regular expression case-insensitively.",
  }),
  Object.freeze({
    flag: "M",
    documentation:
      "Make `^` and `$` also match around newlines in the pattern space.",
  }),
  Object.freeze({
    flag: "m",
    documentation:
      "Make `^` and `$` also match around newlines in the pattern space.",
  }),
]);
const gnuSubstituteFlagSpecifications = applySpecificationOverlays(
  substituteFlagSpecifications,
  gnuSubstituteFlagSpecificationOverlays,
  "flag",
);

export function commandSpecificationsFor(options = defaultSyntaxProfile) {
  const syntaxProfile = requireSyntaxProfile(options);
  return syntaxProfile.dialect === "gnu"
    ? gnuCommandSpecifications
    : commandSpecifications;
}

export function substituteFlagSpecificationsFor(
  options = defaultSyntaxProfile,
) {
  const syntaxProfile = requireSyntaxProfile(options);
  return syntaxProfile.dialect === "gnu"
    ? gnuSubstituteFlagSpecifications
    : substituteFlagSpecifications;
}

const posixSyntaxPolicy = Object.freeze({
  address: Object.freeze({
    backslashRegexpDelimiter: false,
    numericStep: false,
    rangeOffsets: false,
    regexpModifiers: "",
  }),
  commandEnd: Object.freeze({
    closingBraceTerminates: false,
    commentTerminates: false,
    rejectsTrailingBlanksInBlock: true,
  }),
  filename: Object.freeze({
    opaqueUntil: "physical-line",
    separator: "blank-required",
  }),
  label: Object.freeze({
    boundary: "physical-line",
    branchSeparator: "literal-space",
    normalization: "preserve-trailing-blanks",
  }),
  numericArguments: "",
  regexp: Object.freeze({
    escapedPhysicalNewlines: false,
  }),
  shell: Object.freeze({
    inline: false,
    opaqueUntil: null,
  }),
  substituteFlags: Object.freeze({
    separator: "none",
  }),
  text: Object.freeze({
    inline: false,
    opaqueUntil: "physical-line",
  }),
});

const gnuSyntaxPolicy = Object.freeze({
  address: Object.freeze({
    backslashRegexpDelimiter: true,
    numericStep: true,
    rangeOffsets: true,
    regexpModifiers: "IM",
  }),
  commandEnd: Object.freeze({
    closingBraceTerminates: true,
    commentTerminates: true,
    rejectsTrailingBlanksInBlock: false,
  }),
  filename: Object.freeze({
    opaqueUntil: "physical-line",
    separator: "optional-blanks",
  }),
  label: Object.freeze({
    boundary: "gnu-token",
    branchSeparator: "optional-blanks",
    normalization: "trim-syntactic-blanks",
  }),
  numericArguments: "lqQ",
  regexp: Object.freeze({
    escapedPhysicalNewlines: true,
  }),
  shell: Object.freeze({
    inline: true,
    opaqueUntil: "escaped-newline-continuation",
  }),
  substituteFlags: Object.freeze({
    separator: "optional-blanks",
  }),
  text: Object.freeze({
    inline: true,
    opaqueUntil: "physical-line",
  }),
});

const noAddressModifiers = Object.freeze([]);

export function syntaxPolicyFor(options = defaultSyntaxProfile) {
  const syntaxProfile = requireSyntaxProfile(options);
  return syntaxProfile.dialect === "gnu" ? gnuSyntaxPolicy : posixSyntaxPolicy;
}

export function characterAt(text, offset) {
  const codePoint = text.codePointAt(offset);
  if (codePoint === undefined) {
    return null;
  }

  const value = String.fromCodePoint(codePoint);
  return { value, width: value.length };
}

export function skipBlanks(text, offset, end) {
  let cursor = offset;
  while (cursor < end && (text[cursor] === " " || text[cursor] === "\t")) {
    cursor += 1;
  }
  return cursor;
}

function scanDecimalEnd(text, offset, end) {
  let cursor = offset;
  while (cursor < end && text[cursor] >= "0" && text[cursor] <= "9") {
    cursor += 1;
  }
  return cursor;
}

export function findLineEnd(text, offset) {
  const newlineOffset = text.indexOf("\n", offset);
  let lineEnd = newlineOffset === -1 ? text.length : newlineOffset;
  if (lineEnd > offset && text[lineEnd - 1] === "\r") {
    lineEnd -= 1;
  }
  return lineEnd;
}

export function hasUnescapedTrailingBackslash(text, lineStart, lineEnd) {
  let backslashCount = 0;
  let cursor = lineEnd - 1;

  while (cursor >= lineStart && text[cursor] === "\\") {
    backslashCount += 1;
    cursor -= 1;
  }

  return backslashCount % 2 === 1;
}

export function scanCommandRecoverySyntax(
  text,
  offset,
  lineEnd,
  options = defaultSyntaxProfile,
  state = {},
) {
  const syntaxProfile = requireSyntaxProfile(options);
  const policy = syntaxPolicyFor(syntaxProfile);
  const recoverAtClosingBrace =
    (state.recoverAtClosingBrace ?? false) ||
    policy.commandEnd.closingBraceTerminates;
  const separatorOffset = text.indexOf(";", offset);
  const closingBraceOffset = recoverAtClosingBrace
    ? text.indexOf("}", offset)
    : -1;
  const commentOffset = policy.commandEnd.commentTerminates
    ? text.indexOf("#", offset)
    : -1;
  let recoveryOffset = null;
  for (const candidate of [
    separatorOffset,
    closingBraceOffset,
    commentOffset,
  ]) {
    if (
      candidate !== -1 &&
      candidate < lineEnd &&
      (recoveryOffset === null || candidate < recoveryOffset)
    ) {
      recoveryOffset = candidate;
    }
  }

  if (recoveryOffset === null) {
    return {
      nextCommandBoundary: null,
      nextCommandOffset: null,
      recoveryOffset: null,
      terminator: null,
    };
  }

  if (text[recoveryOffset] === "#") {
    return {
      nextCommandBoundary: null,
      nextCommandOffset: null,
      recoveryOffset,
      terminator: "comment",
    };
  }

  if (text[recoveryOffset] === "}") {
    return {
      nextCommandBoundary: "recovered",
      nextCommandOffset: recoveryOffset,
      recoveryOffset,
      terminator: "closing-brace",
    };
  }

  return {
    nextCommandBoundary: "separated",
    nextCommandOffset: recoveryOffset + 1,
    recoveryOffset,
    terminator: "semicolon",
  };
}

export function scanCommandEndSyntax(
  text,
  commandEnd,
  lineEnd,
  options = defaultSyntaxProfile,
  state = {},
) {
  const syntaxProfile = requireSyntaxProfile(options);
  const policy = syntaxPolicyFor(syntaxProfile);
  const insideBlock = state.insideBlock ?? false;
  const recoverAtClosingBrace = state.recoverAtClosingBrace ?? insideBlock;
  const argumentOffset = skipBlanks(text, commandEnd, lineEnd);

  if (
    insideBlock &&
    policy.commandEnd.rejectsTrailingBlanksInBlock &&
    argumentOffset > commandEnd &&
    (argumentOffset >= lineEnd || text[argumentOffset] === ";")
  ) {
    return {
      kind: "unexpected",
      nextCommandBoundary: argumentOffset >= lineEnd ? null : "separated",
      nextCommandOffset: argumentOffset >= lineEnd ? null : argumentOffset + 1,
      startOffset: commandEnd,
      endOffset: argumentOffset,
    };
  }

  if (argumentOffset >= lineEnd) {
    return {
      kind: "valid",
      nextCommandBoundary: null,
      nextCommandOffset: null,
      terminator: "physical-line",
    };
  }

  if (text[argumentOffset] === ";") {
    return {
      kind: "valid",
      nextCommandBoundary: "separated",
      nextCommandOffset: argumentOffset + 1,
      terminator: "semicolon",
    };
  }

  if (policy.commandEnd.commentTerminates && text[argumentOffset] === "#") {
    return {
      kind: "valid",
      nextCommandBoundary: null,
      nextCommandOffset: null,
      terminator: "comment",
    };
  }

  if (
    (policy.commandEnd.closingBraceTerminates || recoverAtClosingBrace) &&
    text[argumentOffset] === "}"
  ) {
    return {
      kind: "valid",
      nextCommandBoundary: "direct",
      nextCommandOffset: argumentOffset,
      terminator: policy.commandEnd.closingBraceTerminates
        ? "closing-brace"
        : "recovered-closing-brace",
    };
  }

  const recovery = scanCommandRecoverySyntax(
    text,
    argumentOffset,
    lineEnd,
    syntaxProfile,
    { recoverAtClosingBrace },
  );
  let unexpectedEnd = recovery.recoveryOffset ?? lineEnd;
  while (
    unexpectedEnd > argumentOffset &&
    (text[unexpectedEnd - 1] === " " || text[unexpectedEnd - 1] === "\t")
  ) {
    unexpectedEnd -= 1;
  }

  return {
    kind: "unexpected",
    nextCommandBoundary: recovery.nextCommandBoundary,
    nextCommandOffset: recovery.nextCommandOffset,
    startOffset: argumentOffset,
    endOffset: unexpectedEnd,
  };
}

function gnuLabelTerminator(character) {
  if (character === ";") {
    return "semicolon";
  }
  if (character === "}") {
    return "closing-brace";
  }
  if (character === "#") {
    return "comment";
  }
  return null;
}

export function scanLabelArgumentSyntax(
  text,
  commandOffset,
  lineEnd,
  options = defaultSyntaxProfile,
) {
  const syntaxProfile = requireSyntaxProfile(options);
  const policy = syntaxPolicyFor(syntaxProfile);
  const command = text[commandOffset];
  const fieldStartOffset = commandOffset + 1;

  if (policy.label.boundary === "physical-line") {
    const labelStartOffset = skipBlanks(text, fieldStartOffset, lineEnd);
    const hasLabel = labelStartOffset < lineEnd;
    const hasValidSeparator = command === ":" || text[fieldStartOffset] === " ";
    return {
      branchContextStartOffset:
        command !== ":" && hasValidSeparator ? fieldStartOffset + 1 : null,
      fieldEndOffset: lineEnd,
      fieldStartOffset,
      hasLabel,
      hasValidSeparator,
      labelEndOffset: lineEnd,
      labelStartOffset,
      name: hasLabel ? text.slice(labelStartOffset, lineEnd) : "",
      nextCommandBoundary: null,
      nextCommandOffset: null,
      terminator: "physical-line",
      terminatorOffset: lineEnd,
    };
  }

  const labelStartOffset = skipBlanks(text, fieldStartOffset, lineEnd);
  let labelEndOffset = labelStartOffset;
  while (labelEndOffset < lineEnd) {
    const character = text[labelEndOffset];
    if (
      character === " " ||
      character === "\t" ||
      gnuLabelTerminator(character) !== null
    ) {
      break;
    }
    labelEndOffset += 1;
  }

  let boundaryOffset = labelEndOffset;
  let terminator = gnuLabelTerminator(text[boundaryOffset]);
  if (text[boundaryOffset] === " " || text[boundaryOffset] === "\t") {
    const afterBlanks = skipBlanks(text, boundaryOffset, lineEnd);
    const structuralTerminator = gnuLabelTerminator(text[afterBlanks]);
    if (afterBlanks >= lineEnd) {
      boundaryOffset = lineEnd;
      terminator = "physical-line";
    } else if (structuralTerminator !== null) {
      boundaryOffset = afterBlanks;
      terminator = structuralTerminator;
    } else {
      terminator = "blank";
      boundaryOffset = labelEndOffset;
    }
  } else if (boundaryOffset >= lineEnd) {
    terminator = "physical-line";
  }

  let nextCommandOffset = null;
  let nextCommandBoundary = null;
  if (terminator === "semicolon") {
    nextCommandOffset = boundaryOffset + 1;
    nextCommandBoundary = "separated";
  } else if (terminator === "closing-brace") {
    nextCommandOffset = boundaryOffset;
    nextCommandBoundary = "direct";
  } else if (terminator === "blank") {
    nextCommandOffset = skipBlanks(text, labelEndOffset, lineEnd);
    nextCommandBoundary = "separated";
  }

  return {
    branchContextStartOffset: command === ":" ? null : fieldStartOffset,
    fieldEndOffset: boundaryOffset,
    fieldStartOffset,
    hasLabel: labelStartOffset < labelEndOffset,
    hasValidSeparator: true,
    labelEndOffset,
    labelStartOffset,
    name: text.slice(labelStartOffset, labelEndOffset),
    nextCommandBoundary,
    nextCommandOffset,
    terminator,
    terminatorOffset: boundaryOffset,
  };
}

export function scanFilenameArgumentSyntax(
  text,
  commandOffset,
  lineEnd,
  options = defaultSyntaxProfile,
) {
  const syntaxProfile = requireSyntaxProfile(options);
  const policy = syntaxPolicyFor(syntaxProfile);
  const fieldStartOffset = commandOffset + 1;
  const hasBlankSeparator =
    text[fieldStartOffset] === " " || text[fieldStartOffset] === "\t";
  const filenameStartOffset = skipBlanks(text, fieldStartOffset, lineEnd);

  return {
    fieldStartOffset,
    filenameEndOffset: lineEnd,
    filenameStartOffset,
    hasName: filenameStartOffset < lineEnd,
    hasValidSeparator:
      policy.filename.separator === "optional-blanks" || hasBlankSeparator,
    name:
      filenameStartOffset < lineEnd
        ? text.slice(filenameStartOffset, lineEnd)
        : "",
    opaqueUntil: policy.filename.opaqueUntil,
  };
}

export function scanTextCommandSyntax(
  text,
  commandOffset,
  lineEnd,
  hasPhysicalNewline,
  options = defaultSyntaxProfile,
) {
  const syntaxProfile = requireSyntaxProfile(options);
  const policy = syntaxPolicyFor(syntaxProfile);
  const fieldStartOffset = commandOffset + 1;

  if (!policy.text.inline) {
    if (text[fieldStartOffset] !== "\\") {
      return {
        kind: "invalid",
        reason: "missing-backslash",
        startOffset: commandOffset,
        endOffset: commandOffset + 1,
      };
    }

    if (fieldStartOffset + 1 < lineEnd) {
      return {
        kind: "invalid",
        reason: "unexpected-after-backslash",
        startOffset: fieldStartOffset + 1,
        endOffset: lineEnd,
        consumesFollowingTextLine: hasPhysicalNewline,
        allowsMissingFollowingTextLine: false,
      };
    }

    if (!hasPhysicalNewline) {
      return {
        kind: "invalid",
        reason: "missing-newline",
        startOffset: fieldStartOffset,
        endOffset: fieldStartOffset + 1,
      };
    }

    return {
      kind: "portable",
      backslashOffset: fieldStartOffset,
      consumesFollowingTextLine: true,
      allowsMissingFollowingTextLine: false,
    };
  }

  const textStartOffset = skipBlanks(text, fieldStartOffset, lineEnd);
  if (textStartOffset >= lineEnd) {
    return hasPhysicalNewline
      ? {
          kind: "inline",
          textStartOffset: lineEnd,
          textEndOffset: lineEnd,
        }
      : {
          kind: "invalid",
          reason: "missing-text",
          startOffset: commandOffset,
          endOffset: commandOffset + 1,
        };
  }

  if (text[textStartOffset] !== "\\") {
    return {
      kind: "inline",
      consumesFollowingTextLine:
        hasPhysicalNewline &&
        hasUnescapedTrailingBackslash(text, textStartOffset, lineEnd),
      allowsMissingFollowingTextLine: true,
      textStartOffset,
      textEndOffset: lineEnd,
    };
  }

  if (textStartOffset + 1 < lineEnd) {
    const leadingTextCharacter = characterAt(text, textStartOffset + 1);
    return {
      kind: "inline",
      consumesFollowingTextLine:
        hasPhysicalNewline &&
        hasUnescapedTrailingBackslash(
          text,
          textStartOffset + 1 + (leadingTextCharacter?.width ?? 0),
          lineEnd,
        ),
      allowsMissingFollowingTextLine: true,
      textStartOffset: textStartOffset + 1,
      textEndOffset: lineEnd,
    };
  }

  if (!hasPhysicalNewline) {
    return {
      kind: "inline",
      textStartOffset: lineEnd,
      textEndOffset: lineEnd,
    };
  }

  return {
    kind: "portable",
    backslashOffset: textStartOffset,
    consumesFollowingTextLine: true,
    allowsMissingFollowingTextLine: true,
  };
}

export function scanShellCommandSyntax(
  text,
  commandOffset,
  lineEnd,
  hasPhysicalNewline,
  options = defaultSyntaxProfile,
) {
  const syntaxProfile = requireSyntaxProfile(options);
  const policy = syntaxPolicyFor(syntaxProfile);
  const fieldStartOffset = commandOffset + 1;

  if (!policy.shell.inline) {
    return {
      kind: "unsupported",
      consumesFollowingTextLine: false,
      fieldStartOffset,
    };
  }

  const shellStartOffset = skipBlanks(text, fieldStartOffset, lineEnd);
  if (shellStartOffset >= lineEnd) {
    return {
      kind: "empty",
      consumesFollowingTextLine: false,
      fieldStartOffset,
      shellEndOffset: lineEnd,
      shellStartOffset: lineEnd,
    };
  }

  if (text[shellStartOffset] !== "\\") {
    return {
      kind: "inline",
      consumesFollowingTextLine:
        hasPhysicalNewline &&
        hasUnescapedTrailingBackslash(text, shellStartOffset, lineEnd),
      fieldStartOffset,
      shellEndOffset: lineEnd,
      shellStartOffset,
    };
  }

  const bodyStartOffset = shellStartOffset + 1;
  if (bodyStartOffset >= lineEnd) {
    return {
      kind: "inline",
      consumesFollowingTextLine: hasPhysicalNewline,
      fieldStartOffset,
      shellEndOffset: lineEnd,
      shellStartOffset: bodyStartOffset,
    };
  }

  const leadingShellCharacter = characterAt(text, bodyStartOffset);
  return {
    kind: "inline",
    consumesFollowingTextLine:
      hasPhysicalNewline &&
      hasUnescapedTrailingBackslash(
        text,
        bodyStartOffset + (leadingShellCharacter?.width ?? 0),
        lineEnd,
      ),
    fieldStartOffset,
    shellEndOffset: lineEnd,
    shellStartOffset: bodyStartOffset,
  };
}

export function scanOptionalNumericArgumentSyntax(
  text,
  commandOffset,
  lineEnd,
  options = defaultSyntaxProfile,
) {
  const syntaxProfile = requireSyntaxProfile(options);
  const policy = syntaxPolicyFor(syntaxProfile);
  const command = text[commandOffset];
  const fieldStartOffset = commandOffset + 1;
  const argumentStartOffset = skipBlanks(text, fieldStartOffset, lineEnd);
  const argumentEndOffset = policy.numericArguments.includes(command)
    ? scanDecimalEnd(text, argumentStartOffset, lineEnd)
    : argumentStartOffset;

  return {
    argumentEndOffset,
    argumentStartOffset,
    commandEndOffset:
      argumentEndOffset > argumentStartOffset
        ? argumentEndOffset
        : fieldStartOffset,
    hasArgument: argumentEndOffset > argumentStartOffset,
    value:
      argumentEndOffset > argumentStartOffset
        ? text.slice(argumentStartOffset, argumentEndOffset)
        : null,
  };
}

function versionCharacterCode(value, offset) {
  return offset < value.length ? value.charCodeAt(offset) : 0;
}

function isVersionDigit(code) {
  return code >= 48 && code <= 57;
}

function digitRunEnd(value, offset) {
  let endOffset = offset;
  while (isVersionDigit(versionCharacterCode(value, endOffset))) {
    endOffset += 1;
  }
  return endOffset;
}

function compareVersionTokenToTarget(version, targetVersion) {
  let leftOffset = 0;
  let rightOffset = 0;

  while (true) {
    const leftCode = versionCharacterCode(version, leftOffset);
    const rightCode = versionCharacterCode(targetVersion, rightOffset);
    if (leftCode === 0) {
      return leftCode - rightCode;
    }

    // The fixed target has no digit run beginning with zero. Nonzero runs
    // compare by magnitude; a leading-zero requirement stays in byte order.
    if (
      leftCode !== 48 &&
      rightCode !== 48 &&
      isVersionDigit(leftCode) &&
      isVersionDigit(rightCode)
    ) {
      const leftEnd = digitRunEnd(version, leftOffset);
      const rightEnd = digitRunEnd(targetVersion, rightOffset);
      const lengthDifference = leftEnd - leftOffset - (rightEnd - rightOffset);
      if (lengthDifference !== 0) {
        return lengthDifference;
      }

      const leftDigits = version.slice(leftOffset, leftEnd);
      const rightDigits = targetVersion.slice(rightOffset, rightEnd);
      if (leftDigits !== rightDigits) {
        return leftDigits < rightDigits ? -1 : 1;
      }

      leftOffset = leftEnd;
      rightOffset = rightEnd;
      continue;
    }

    const difference = leftCode - rightCode;
    if (difference !== 0) {
      return difference;
    }

    leftOffset += 1;
    rightOffset += 1;
  }
}

export const gnuSedTargetVersion = "4.10";

export function isGnuSedVersionSupported(version) {
  return compareVersionTokenToTarget(version, gnuSedTargetVersion) <= 0;
}

export function scanVersionArgumentSyntax(
  text,
  commandOffset,
  lineEnd,
  options = defaultSyntaxProfile,
) {
  const argument = scanLabelArgumentSyntax(
    text,
    commandOffset,
    lineEnd,
    options,
  );
  const comparedVersion = argument.hasLabel ? argument.name : "4.0";

  return {
    comparedVersion,
    endOffset: argument.labelEndOffset,
    hasArgument: argument.hasLabel,
    isSupported: isGnuSedVersionSupported(comparedVersion),
    nextCommandBoundary: argument.nextCommandBoundary,
    nextCommandOffset: argument.nextCommandOffset,
    startOffset: argument.labelStartOffset,
    terminator: argument.terminator,
    value: argument.hasLabel ? argument.name : null,
  };
}

function physicalNewlineWidthAt(text, offset, end) {
  if (text[offset] === "\n") {
    return 1;
  }
  if (text[offset] === "\r" && offset + 1 < end && text[offset + 1] === "\n") {
    return 2;
  }
  return 0;
}

function scanRegexpSyntax(text, offset, end, delimiter, syntaxProfile) {
  const policy = syntaxPolicyFor(syntaxProfile);
  let cursor = offset;
  let inBracketExpression = false;
  let atFirstBracketCharacter = false;
  let canNegateBracketExpression = false;
  let bracketElementMarker = null;
  let bracketElementCanClose = false;
  let recoveryBackslashCount = 0;
  let possibleClosingOffset = null;

  while (cursor < end) {
    const character = characterAt(text, cursor);
    if (character === null) {
      break;
    }
    const physicalNewlineWidth = physicalNewlineWidthAt(text, cursor, end);
    if (physicalNewlineWidth > 0) {
      return {
        closingOffset: null,
        failureOffset: cursor,
        hasUnclosedBracketExpression:
          inBracketExpression || bracketElementMarker !== null,
        possibleClosingOffset,
      };
    }

    if (inBracketExpression) {
      // If the unfinished `[` is treated as ordinary, an odd backslash run
      // still prevents the following delimiter from ending the RE.
      const isEscapedOutsideBracket = recoveryBackslashCount % 2 === 1;

      if (bracketElementMarker !== null) {
        if (character.value === "[") {
          cursor += character.width;
          continue;
        }
        if (character.value === bracketElementMarker) {
          bracketElementCanClose = !bracketElementCanClose;
          cursor += character.width;
          continue;
        }
        if (character.value === "]" && bracketElementCanClose) {
          bracketElementMarker = null;
          bracketElementCanClose = false;
          recoveryBackslashCount = 0;
          atFirstBracketCharacter = false;
          canNegateBracketExpression = false;
          cursor += character.width;
          continue;
        }

        bracketElementCanClose = false;
        cursor += character.width;
        continue;
      }

      if (
        character.value === "[" &&
        ".:=".includes(text[cursor + character.width])
      ) {
        bracketElementMarker = text[cursor + character.width];
        bracketElementCanClose = false;
        recoveryBackslashCount = 0;
        cursor += character.width + 1;
        continue;
      }

      if (canNegateBracketExpression && character.value === "^") {
        canNegateBracketExpression = false;
        recoveryBackslashCount = 0;
        cursor += character.width;
        continue;
      }

      if (atFirstBracketCharacter && character.value === "]") {
        atFirstBracketCharacter = false;
        canNegateBracketExpression = false;
        recoveryBackslashCount = 0;
        cursor += character.width;
        continue;
      }

      if (
        delimiter !== null &&
        !isEscapedOutsideBracket &&
        possibleClosingOffset === null &&
        character.value === delimiter.value
      ) {
        possibleClosingOffset = cursor;
      }

      if (character.value === "]") {
        inBracketExpression = false;
        bracketElementCanClose = false;
        recoveryBackslashCount = 0;
        possibleClosingOffset = null;
        cursor += character.width;
        continue;
      }

      atFirstBracketCharacter = false;
      canNegateBracketExpression = false;
      recoveryBackslashCount =
        character.value === "\\" ? recoveryBackslashCount + 1 : 0;
      cursor += character.width;
      continue;
    }

    if (delimiter !== null && character.value === delimiter.value) {
      return {
        closingOffset: cursor,
        hasUnclosedBracketExpression: false,
        possibleClosingOffset: null,
      };
    }

    if (character.value === "\\") {
      const escapedOffset = cursor + character.width;
      if (escapedOffset >= end) {
        break;
      }
      const escaped = characterAt(text, escapedOffset);
      if (escaped === null) {
        break;
      }
      const escapedNewlineWidth = escaped.value === "\n" ? 1 : 0;
      if (escapedNewlineWidth > 0) {
        if (!policy.regexp.escapedPhysicalNewlines) {
          return {
            closingOffset: null,
            failureOffset: escapedOffset,
            hasUnclosedBracketExpression: false,
            possibleClosingOffset: null,
          };
        }

        const continuationEnd = escapedOffset + escapedNewlineWidth;
        cursor = continuationEnd;
        continue;
      }

      if (
        syntaxProfile.dialect === "posix" &&
        delimiter?.value === "[" &&
        escaped.value === delimiter.value
      ) {
        // POSIX leaves `\[` unspecified when `[` is the delimiter: it may
        // stay special and begin a bracket expression, changing the boundary.
        return {
          closingOffset: null,
          hasUnclosedBracketExpression: false,
          isDelimiterInterpretationUnspecified: true,
          possibleClosingOffset: null,
        };
      }

      if (syntaxProfile.dialect === "gnu" && escaped.value === "c") {
        const payloadOffset = escapedOffset + escaped.width;
        if (payloadOffset >= end) {
          cursor = payloadOffset;
          continue;
        }

        const payload = characterAt(text, payloadOffset);
        if (payload === null) {
          break;
        }
        const payloadNewlineWidth = payload.value === "\n" ? 1 : 0;
        const controlEscapeEnd =
          payloadNewlineWidth > 0
            ? payloadOffset + payloadNewlineWidth
            : payloadOffset + payload.width;
        cursor = controlEscapeEnd;
        continue;
      }

      const escapeEnd = escapedOffset + escaped.width;
      cursor = escapeEnd;
      continue;
    }

    if (character.value === "[") {
      inBracketExpression = true;
      atFirstBracketCharacter = true;
      recoveryBackslashCount = 0;
      canNegateBracketExpression = true;
      cursor += character.width;
      continue;
    }

    cursor += character.width;
  }

  return {
    closingOffset: null,
    hasUnclosedBracketExpression:
      inBracketExpression || bracketElementMarker !== null,
    possibleClosingOffset,
  };
}

export function scanRegexDelimiter(
  text,
  offset,
  end,
  delimiter,
  syntaxProfile = defaultSyntaxProfile,
) {
  return scanRegexpSyntax(text, offset, end, delimiter, syntaxProfile);
}

export function scanAddressSyntax(
  text,
  offset,
  end,
  syntaxProfile = defaultSyntaxProfile,
) {
  const profile = requireSyntaxProfile(syntaxProfile);
  const policy = syntaxPolicyFor(profile);
  const first = text[offset];

  if (first >= "0" && first <= "9") {
    const cursor = scanDecimalEnd(text, offset + 1, end);

    const firstValue = text.slice(offset, cursor);
    if (policy.address.numericStep) {
      const operatorOffset = skipBlanks(text, cursor, end);
      if (text[operatorOffset] === "~") {
        const stepStartOffset = skipBlanks(text, operatorOffset + 1, end);
        const stepEndOffset = scanDecimalEnd(text, stepStartOffset, end);

        return {
          kind: "valid",
          addressKind: "line-number-step",
          endOffset:
            stepEndOffset > stepStartOffset
              ? stepEndOffset
              : operatorOffset + 1,
          isUndefined: false,
          modifiers: noAddressModifiers,
          operatorOffset,
          startOffset: offset,
          stepEndOffset,
          stepStartOffset,
          value: {
            first: firstValue,
            // GNU sed 4.10 treats an omitted step as zero when a command
            // follows. Keep null so callers can still distinguish the source.
            step:
              stepEndOffset > stepStartOffset
                ? text.slice(stepStartOffset, stepEndOffset)
                : null,
          },
        };
      }
    }

    return {
      kind: "valid",
      addressKind: "line-number",
      endOffset: cursor,
      isUndefined: false,
      modifiers: noAddressModifiers,
      startOffset: offset,
      value: firstValue,
    };
  }

  if (policy.address.rangeOffsets && (first === "+" || first === "~")) {
    const valueStartOffset = skipBlanks(text, offset + 1, end);
    const valueEndOffset = scanDecimalEnd(text, valueStartOffset, end);

    return {
      kind: "valid",
      addressKind:
        first === "+" ? "relative-line-count" : "relative-line-multiple",
      endOffset:
        valueEndOffset > valueStartOffset ? valueEndOffset : offset + 1,
      isUndefined: false,
      modifiers: noAddressModifiers,
      operatorOffset: offset,
      startOffset: offset,
      // A missing value has GNU sed's null-address behavior. Preserve the
      // omission instead of manufacturing a source value of "0".
      value:
        valueEndOffset > valueStartOffset
          ? text.slice(valueStartOffset, valueEndOffset)
          : null,
      valueEndOffset,
      valueStartOffset,
    };
  }

  if (first === "$") {
    return {
      kind: "valid",
      addressKind: "last-line",
      endOffset: offset + 1,
      isUndefined: false,
      modifiers: noAddressModifiers,
      startOffset: offset,
      value: "$",
    };
  }

  let delimiterOffset;
  if (first === "/") {
    delimiterOffset = offset;
  } else if (first === "\\") {
    delimiterOffset = offset + 1;
  } else {
    return { kind: "none" };
  }

  if (delimiterOffset >= end) {
    return {
      kind: "invalid",
      delimiterOffset,
      reason: "missing-delimiter",
    };
  }

  const delimiter = characterAt(text, delimiterOffset);
  if (
    delimiter === null ||
    (delimiter.value === "\\" && !policy.address.backslashRegexpDelimiter) ||
    delimiter.value === "\n"
  ) {
    return {
      kind: "invalid",
      delimiter,
      delimiterOffset,
      reason: "invalid-delimiter",
    };
  }

  const result = scanRegexDelimiter(
    text,
    delimiterOffset + delimiter.width,
    end,
    delimiter,
    syntaxProfile,
  );
  const closingOffset =
    result.closingOffset ??
    (profile.dialect === "posix" && result.hasUnclosedBracketExpression
      ? result.possibleClosingOffset
      : null);

  if (closingOffset === null) {
    return profile.dialect === "posix" &&
      (result.hasUnclosedBracketExpression ||
        result.isDelimiterInterpretationUnspecified)
      ? {
          endOffset: result.failureOffset ?? end,
          kind: "indeterminate",
          delimiter,
          delimiterOffset,
          reason: result.isDelimiterInterpretationUnspecified
            ? "unspecified-escaped-delimiter"
            : "undefined-bracket-expression",
        }
      : {
          endOffset: result.failureOffset ?? end,
          kind: "invalid",
          delimiter,
          delimiterOffset,
          reason: "unterminated",
        };
  }

  const patternStartOffset = delimiterOffset + delimiter.width;
  let addressEndOffset = closingOffset + delimiter.width;
  const modifiers = [];

  if (policy.address.regexpModifiers !== "") {
    let modifierSearchOffset = addressEndOffset;
    while (modifierSearchOffset < end) {
      const modifierOffset = skipBlanks(text, modifierSearchOffset, end);
      const modifier = text[modifierOffset];
      if (!policy.address.regexpModifiers.includes(modifier)) {
        break;
      }

      modifiers.push({
        endOffset: modifierOffset + 1,
        startOffset: modifierOffset,
        value: modifier,
      });
      addressEndOffset = modifierOffset + 1;
      modifierSearchOffset = addressEndOffset;
    }
  }

  return {
    kind: "valid",
    addressKind: "regular-expression",
    delimiter,
    delimiterOffset,
    endOffset: addressEndOffset,
    isUndefined: result.closingOffset === null,
    modifiers:
      modifiers.length === 0 ? noAddressModifiers : Object.freeze(modifiers),
    patternEndOffset: closingOffset,
    patternStartOffset,
    startOffset: offset,
    value: text.slice(patternStartOffset, closingOffset),
  };
}

function regexpEscapeKind(value, syntaxProfile) {
  if (value >= "1" && value <= "9") {
    return "back-reference";
  }
  if (syntaxProfile.regexpMode === "bre" && value === "(") {
    return "subexpression-open";
  }
  if (syntaxProfile.regexpMode === "bre" && value === ")") {
    return "subexpression-close";
  }
  if (
    syntaxProfile.dialect === "gnu" &&
    syntaxProfile.regexpMode === "bre" &&
    ["+", "?", "|"].includes(value)
  ) {
    return "operator";
  }
  if (syntaxProfile.dialect === "gnu" && ["`", "'"].includes(value)) {
    return "anchor";
  }
  if (
    syntaxProfile.dialect === "gnu" &&
    ["b", "B", "<", ">", "w", "W", "s", "S"].includes(value)
  ) {
    return "word-boundary";
  }
  return "escaped-character";
}

function regexpUnit(value, startOffset, endOffset, origin = null) {
  return { endOffset, origin, startOffset, value };
}

function numericEscapeValue(text, digitOffset, end, base) {
  const maximumDigits = base === 16 ? 2 : 3;
  let cursor = digitOffset;
  let value = 0;
  let digits = 0;
  while (cursor < end && digits < maximumDigits) {
    const code = text.charCodeAt(cursor);
    const digit =
      code >= 48 && code <= 57
        ? code - 48
        : code >= 65 && code <= 70
          ? code - 55
          : code >= 97 && code <= 102
            ? code - 87
            : -1;
    if (digit < 0 || digit >= base) {
      break;
    }
    value = value * base + digit;
    digits += 1;
    cursor += 1;
  }
  return { cursor, digits, value };
}

const gnuSimpleRegexpEscapes = new Map([
  ["a", "\u0007"],
  ["f", "\f"],
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"],
  ["v", "\u000b"],
]);

function gnuNormalizedRegexpEscape(text, escapedOffset, end) {
  const escaped = characterAt(text, escapedOffset);
  if (escaped === null || escapedOffset >= end) {
    return null;
  }

  const simpleValue = gnuSimpleRegexpEscapes.get(escaped.value);
  if (simpleValue !== undefined) {
    return {
      endOffset: escapedOffset + escaped.width,
      value: simpleValue,
    };
  }

  if (escaped.value === "c") {
    const payloadOffset = escapedOffset + escaped.width;
    const payload = characterAt(text, payloadOffset);
    if (payload !== null && payloadOffset < end) {
      if (payload.value === "\\") {
        const recursiveOffset = payloadOffset + payload.width;
        const recursive = characterAt(text, recursiveOffset);
        if (
          recursive === null ||
          recursiveOffset >= end ||
          recursive.value !== "\\"
        ) {
          return {
            endOffset:
              recursive === null || recursiveOffset >= end
                ? recursiveOffset
                : recursiveOffset + recursive.width,
            problem: "recursive-control-escape",
            value: String.fromCharCode(
              payload.value.toUpperCase().charCodeAt(0) ^ 0x40,
            ),
          };
        }

        return {
          endOffset: recursiveOffset + recursive.width,
          value: String.fromCharCode(
            payload.value.toUpperCase().charCodeAt(0) ^ 0x40,
          ),
        };
      }

      return {
        endOffset: payloadOffset + payload.width,
        value: String.fromCharCode(
          payload.value.toUpperCase().charCodeAt(0) ^ 0x40,
        ),
      };
    }
    return null;
  }

  const base =
    escaped.value === "d"
      ? 10
      : escaped.value === "o"
        ? 8
        : escaped.value === "x"
          ? 16
          : null;
  if (base === null) {
    return null;
  }

  const numeric = numericEscapeValue(
    text,
    escapedOffset + escaped.width,
    end,
    base,
  );
  return {
    endOffset:
      numeric.digits === 0 ? escapedOffset + escaped.width : numeric.cursor,
    value:
      numeric.digits === 0
        ? escaped.value
        : String.fromCharCode(numeric.value & 0xff),
  };
}

function createRawRegexpBracketState() {
  return {
    bracketElementCanClose: false,
    bracketElementMarker: null,
    canNegate: false,
    firstCharacter: false,
    inBracket: false,
    skipBracketElementOpener: false,
  };
}

function advanceRawRegexpBracketState(text, offset, end, state) {
  let cursor = offset;
  while (cursor < end) {
    const character = characterAt(text, cursor);
    if (character === null) {
      break;
    }

    if (state.skipBracketElementOpener) {
      state.skipBracketElementOpener = false;
      cursor += character.width;
      continue;
    }

    if (!state.inBracket) {
      if (character.value === "[") {
        state.inBracket = true;
        state.firstCharacter = true;
        state.canNegate = true;
      }
      cursor += character.width;
      continue;
    }

    if (state.bracketElementMarker !== null) {
      if (character.value === "[") {
        // GNU sed's raw delimiter scanner preserves the "can close" phase
        // across a nested left bracket inside a bracket element.
      } else if (character.value === state.bracketElementMarker) {
        state.bracketElementCanClose = !state.bracketElementCanClose;
      } else if (character.value === "]" && state.bracketElementCanClose) {
        state.bracketElementCanClose = false;
        state.bracketElementMarker = null;
        state.firstCharacter = false;
        state.canNegate = false;
      } else {
        state.bracketElementCanClose = false;
      }
      cursor += character.width;
      continue;
    }

    const marker = text[cursor + character.width];
    if (character.value === "[" && ".:=".includes(marker)) {
      state.bracketElementCanClose = false;
      state.bracketElementMarker = marker;
      state.skipBracketElementOpener = true;
      state.firstCharacter = false;
      state.canNegate = false;
      cursor += character.width;
      continue;
    }

    if (state.canNegate && character.value === "^") {
      state.canNegate = false;
    } else if (state.firstCharacter && character.value === "]") {
      state.firstCharacter = false;
      state.canNegate = false;
    } else if (character.value === "]") {
      state.inBracket = false;
      state.firstCharacter = false;
      state.canNegate = false;
    } else {
      state.firstCharacter = false;
      state.canNegate = false;
    }
    cursor += character.width;
  }
}

function* regexpUnits(text, offset, end, delimiter, syntaxProfile) {
  const rawBracketState = createRawRegexpBracketState();
  let cursor = offset;

  while (cursor < end) {
    const character = characterAt(text, cursor);
    if (character === null) {
      break;
    }

    if (character.value !== "\\") {
      const characterEnd = cursor + character.width;
      yield regexpUnit(character.value, cursor, characterEnd);
      advanceRawRegexpBracketState(text, cursor, characterEnd, rawBracketState);
      cursor = characterEnd;
      continue;
    }

    const wasInRawBracket = rawBracketState.inBracket;
    const escapedOffset = cursor + character.width;
    if (escapedOffset >= end) {
      yield regexpUnit(character.value, cursor, escapedOffset);
      if (wasInRawBracket) {
        advanceRawRegexpBracketState(
          text,
          cursor,
          escapedOffset,
          rawBracketState,
        );
      }
      break;
    }
    const escaped = characterAt(text, escapedOffset);
    if (escaped === null) {
      break;
    }

    const escapedEnd = escapedOffset + escaped.width;
    if (escaped.value === "\n") {
      yield regexpUnit("\n", cursor, escapedEnd);
      if (wasInRawBracket) {
        advanceRawRegexpBracketState(text, cursor, escapedEnd, rawBracketState);
      }
      cursor = escapedEnd;
      continue;
    }

    if (
      !wasInRawBracket &&
      delimiter !== null &&
      escaped.value === delimiter.value
    ) {
      yield regexpUnit(escaped.value, cursor, escapedEnd);
      cursor = escapedEnd;
      continue;
    }

    if (syntaxProfile.dialect === "gnu") {
      const normalized = gnuNormalizedRegexpEscape(text, escapedOffset, end);
      if (normalized !== null) {
        yield regexpUnit(
          normalized.value,
          cursor,
          normalized.endOffset,
          normalized.problem === "recursive-control-escape"
            ? "invalid-control-escape"
            : "character-escape",
        );
        if (wasInRawBracket) {
          advanceRawRegexpBracketState(
            text,
            cursor,
            normalized.endOffset,
            rawBracketState,
          );
        }
        cursor = normalized.endOffset;
        continue;
      }
    }

    yield regexpUnit("\\", cursor, escapedOffset);
    yield regexpUnit(escaped.value, escapedOffset, escapedEnd);
    if (wasInRawBracket) {
      advanceRawRegexpBracketState(text, cursor, escapedEnd, rawBracketState);
    }
    cursor = escapedEnd;
  }
}

function advanceRegexpUnitStream(stream, count = 1) {
  for (let advanced = 0; advanced < count; advanced += 1) {
    stream.current = stream.next;
    stream.next = stream.iterator.next();
  }
}

export function* iterateRegexpTokens(
  text,
  offset,
  end,
  delimiter = null,
  syntaxProfile = defaultSyntaxProfile,
) {
  const profile = requireSyntaxProfile(syntaxProfile);
  const iterator = regexpUnits(text, offset, end, delimiter, profile);
  const stream = {
    current: iterator.next(),
    iterator,
    next: iterator.next(),
  };
  let inBracket = false;
  let firstBracketCharacter = false;
  let canNegateBracket = false;
  let bracketElementMarker = null;
  let bracketStartOffset = null;

  while (!stream.current.done) {
    const unit = stream.current.value;
    const nextUnit = stream.next.done ? null : stream.next.value;

    if (unit.origin === "invalid-control-escape") {
      yield {
        endOffset: unit.endOffset,
        escaped: true,
        kind: "invalid-control-escape",
        offset: unit.startOffset,
        origin: unit.origin,
        value: "c",
        width: unit.endOffset - unit.startOffset,
      };
    }

    if (inBracket) {
      if (bracketElementMarker !== null) {
        if (unit.value === bracketElementMarker && nextUnit?.value === "]") {
          bracketElementMarker = null;
          firstBracketCharacter = false;
          canNegateBracket = false;
          advanceRegexpUnitStream(stream, 2);
        } else {
          advanceRegexpUnitStream(stream);
        }
        continue;
      }

      if (unit.value === "[" && ".:=".includes(nextUnit?.value)) {
        bracketElementMarker = nextUnit.value;
        advanceRegexpUnitStream(stream, 2);
        continue;
      }
      if (
        canNegateBracket &&
        unit.value === "^" &&
        bracketElementMarker === null
      ) {
        canNegateBracket = false;
      } else if (
        firstBracketCharacter &&
        unit.value === "]" &&
        bracketElementMarker === null
      ) {
        firstBracketCharacter = false;
        canNegateBracket = false;
      } else if (unit.value === "]") {
        inBracket = false;
        bracketStartOffset = null;
      } else {
        firstBracketCharacter = false;
        canNegateBracket = false;
      }
      advanceRegexpUnitStream(stream);
      continue;
    }

    if (unit.value === "[") {
      inBracket = true;
      bracketStartOffset = unit.startOffset;
      firstBracketCharacter = true;
      canNegateBracket = true;
      advanceRegexpUnitStream(stream);
      continue;
    }

    if (unit.value === "\\" && nextUnit !== null) {
      yield {
        endOffset: nextUnit.endOffset,
        escaped: true,
        kind: regexpEscapeKind(nextUnit.value, profile),
        offset: unit.startOffset,
        origin: unit.origin ?? nextUnit.origin,
        value: nextUnit.value,
        width: nextUnit.endOffset - unit.startOffset,
      };
      advanceRegexpUnitStream(stream, 2);
      continue;
    }

    if (
      profile.regexpMode === "ere" &&
      (unit.value === "(" || unit.value === ")")
    ) {
      yield {
        endOffset: unit.endOffset,
        escaped: false,
        kind: unit.value === "(" ? "subexpression-open" : "subexpression-close",
        offset: unit.startOffset,
        origin: unit.origin,
        value: unit.value,
        width: unit.endOffset - unit.startOffset,
      };
    } else if (unit.origin === "character-escape") {
      yield {
        endOffset: unit.endOffset,
        escaped: true,
        kind: "character-escape",
        offset: unit.startOffset,
        origin: unit.origin,
        value: unit.value,
        width: unit.endOffset - unit.startOffset,
      };
    }
    advanceRegexpUnitStream(stream);
  }

  if (inBracket && bracketStartOffset !== null) {
    yield {
      endOffset: end,
      escaped: false,
      kind: "unclosed-bracket-expression",
      offset: bracketStartOffset,
      origin: null,
      value: "[",
      width: end - bracketStartOffset,
    };
  }
}

export function findRegexpTokens(
  text,
  offset,
  end,
  delimiter = null,
  syntaxProfile = defaultSyntaxProfile,
) {
  return Array.from(
    iterateRegexpTokens(text, offset, end, delimiter, syntaxProfile),
  );
}

const noReplacementCaseConversionEscapes = Object.freeze([]);

export function findReplacementCaseConversionEscapes(
  text,
  offset,
  end,
  delimiter,
  syntaxProfile = defaultSyntaxProfile,
) {
  const profile = requireSyntaxProfile(syntaxProfile);
  if (profile.dialect !== "gnu") {
    return noReplacementCaseConversionEscapes;
  }

  const caseConversionEscapes = [];
  let cursor = offset;
  while (cursor < end) {
    const character = characterAt(text, cursor);
    if (character === null) {
      break;
    }

    if (character.value !== "\\") {
      cursor += character.width;
      continue;
    }

    const escaped = characterAt(text, cursor + character.width);
    if (escaped === null || cursor + character.width >= end) {
      break;
    }

    if (
      escaped.value !== delimiter.value &&
      ["L", "l", "U", "u", "E"].includes(escaped.value)
    ) {
      caseConversionEscapes.push({
        endOffset: cursor + character.width + escaped.width,
        startOffset: cursor,
        value: escaped.value,
      });
    }
    cursor += character.width + escaped.width;
  }

  return caseConversionEscapes.length === 0
    ? noReplacementCaseConversionEscapes
    : Object.freeze(caseConversionEscapes);
}

export function findInvalidReplacementControlEscape(
  text,
  offset,
  end,
  delimiter,
  syntaxProfile = defaultSyntaxProfile,
) {
  const profile = requireSyntaxProfile(syntaxProfile);
  if (profile.dialect !== "gnu") {
    return null;
  }

  let cursor = offset;
  while (cursor < end) {
    const character = characterAt(text, cursor);
    if (character === null) {
      break;
    }
    if (character.value !== "\\") {
      cursor += character.width;
      continue;
    }

    const escapedOffset = cursor + character.width;
    const escaped = characterAt(text, escapedOffset);
    if (escaped === null || escapedOffset >= end) {
      break;
    }
    if (escaped.value !== "c" || escaped.value === delimiter.value) {
      cursor = escapedOffset + escaped.width;
      continue;
    }

    const payloadOffset = escapedOffset + escaped.width;
    const payload = characterAt(text, payloadOffset);
    if (payload === null || payloadOffset >= end) {
      break;
    }
    if (payload.value !== "\\") {
      cursor = payloadOffset + payload.width;
      continue;
    }

    const recursiveOffset = payloadOffset + payload.width;
    const recursive = characterAt(text, recursiveOffset);
    if (recursive === null || recursiveOffset >= end) {
      return {
        endOffset: recursiveOffset,
        startOffset: cursor,
      };
    }

    const escapedDelimiterRemovesBackslash =
      recursive.value === delimiter.value && delimiter.value !== "&";
    if (
      recursive.value !== "\\" &&
      recursive.value !== "\n" &&
      !escapedDelimiterRemovesBackslash
    ) {
      return {
        endOffset: recursiveOffset + recursive.width,
        startOffset: cursor,
      };
    }
    cursor = recursiveOffset + recursive.width;
  }

  return null;
}

export function findReplacementDelimiter(
  text,
  offset,
  delimiter,
  syntaxProfile = defaultSyntaxProfile,
) {
  requireSyntaxProfile(syntaxProfile);
  let cursor = offset;

  while (cursor < text.length) {
    const character = characterAt(text, cursor);
    if (character === null) {
      break;
    }

    if (character.value === delimiter.value) {
      return {
        closingOffset: cursor,
        failureOffset: null,
      };
    }

    if (character.value === "\n") {
      return {
        closingOffset: null,
        failureOffset: cursor,
      };
    }

    if (character.value === "\\") {
      const escaped = characterAt(text, cursor + character.width);
      if (escaped === null) {
        return {
          closingOffset: null,
          failureOffset: text.length,
        };
      }

      cursor += character.width + escaped.width;
      continue;
    }

    cursor += character.width;
  }

  return {
    closingOffset: null,
    failureOffset: text.length,
  };
}

export function findTransliterateDelimiter(
  text,
  offset,
  lineEnd,
  delimiter,
  _syntaxProfile = defaultSyntaxProfile,
) {
  let cursor = offset;

  while (cursor < lineEnd) {
    const character = characterAt(text, cursor);
    if (character === null) {
      break;
    }

    if (character.value === "\\") {
      const escaped = characterAt(text, cursor + character.width);
      if (escaped === null) {
        return null;
      }
      cursor += character.width + escaped.width;
      continue;
    }

    if (character.value === delimiter.value) {
      return cursor;
    }

    cursor += character.width;
  }

  return null;
}

export function createSubstituteFlagState() {
  return {
    evaluation: false,
    global: false,
    occurrenceNumber: null,
    printTiming: null,
  };
}

function isZeroDecimalToken(value) {
  for (const digit of value) {
    if (digit !== "0") {
      return false;
    }
  }
  return true;
}

const substituteFlagValuesByProfile = new Map();

function substituteFlagValuesFor(syntaxProfile) {
  let values = substituteFlagValuesByProfile.get(syntaxProfile);
  if (values === undefined) {
    values = new Set(
      substituteFlagSpecificationsFor(syntaxProfile).map(({ flag }) => flag),
    );
    substituteFlagValuesByProfile.set(syntaxProfile, values);
  }
  return values;
}

export function scanSubstituteFlagTokenSyntax(
  text,
  offset,
  end,
  state = createSubstituteFlagState(),
  syntaxProfile = defaultSyntaxProfile,
) {
  const profile = requireSyntaxProfile(syntaxProfile);
  const character = characterAt(text, offset);
  if (character === null || offset >= end) {
    return { kind: "none", endOffset: offset, state };
  }

  if (character.value >= "0" && character.value <= "9") {
    const endOffset = scanDecimalEnd(text, offset + 1, end);
    const value = text.slice(offset, endOffset);
    if (profile.dialect === "gnu" && state.occurrenceNumber !== null) {
      return {
        endOffset,
        kind: "invalid",
        reason: "repeated-occurrence",
        startOffset: offset,
        state,
        value,
      };
    }

    const isZero =
      profile.dialect === "gnu"
        ? isZeroDecimalToken(value)
        : value.startsWith("0");
    if (isZero) {
      return {
        endOffset,
        kind: "invalid",
        reason: "zero-occurrence",
        startOffset: offset,
        state,
        value,
      };
    }

    return {
      endOffset,
      kind: "occurrence",
      startOffset: offset,
      state: { ...state, occurrenceNumber: value },
      value,
    };
  }

  const endOffset = offset + character.width;
  if (character.value === "w") {
    return {
      endOffset,
      kind: "write",
      startOffset: offset,
      state,
      value: character.value,
    };
  }

  if (!substituteFlagValuesFor(profile).has(character.value)) {
    return {
      endOffset,
      kind: "invalid",
      reason: "unknown",
      startOffset: offset,
      state,
      value: character.value,
    };
  }

  if (
    profile.dialect === "gnu" &&
    ((character.value === "g" && state.global) ||
      (character.value === "p" && state.printTiming !== null))
  ) {
    return {
      endOffset,
      kind: "invalid",
      reason: character.value === "g" ? "repeated-global" : "repeated-print",
      startOffset: offset,
      state,
      value: character.value,
    };
  }

  const nextState = { ...state };
  if (character.value === "e") {
    nextState.evaluation = true;
  } else if (character.value === "g") {
    nextState.global = true;
  } else if (character.value === "p") {
    nextState.printTiming = state.evaluation
      ? "after-evaluation"
      : "before-evaluation";
  }

  return {
    endOffset,
    kind: "flag",
    startOffset: offset,
    state: nextState,
    value: character.value,
  };
}
