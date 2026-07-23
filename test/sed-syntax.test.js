import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import {
  characterAt,
  commandSpecifications,
  commandSpecificationsFor,
  gnuSedTargetVersion,
  isGnuSedVersionSupported,
  scanAddressSyntax,
  scanCommandEndSyntax,
  scanCommandRecoverySyntax,
  scanFilenameArgumentSyntax,
  scanLabelArgumentSyntax,
  scanOptionalNumericArgumentSyntax,
  scanRegexDelimiter,
  scanShellCommandSyntax,
  scanTextCommandSyntax,
  scanVersionArgumentSyntax,
  syntaxPolicyFor,
} from "../src/sed-syntax.js";

const posixBreProfile = Object.freeze({
  dialect: "posix",
  regexpMode: "bre",
});
const gnuBreProfile = Object.freeze({
  dialect: "gnu",
  regexpMode: "bre",
});

test("adds GNU command metadata only for the GNU syntax profile", () => {
  const posixCommands = commandSpecificationsFor(posixBreProfile);
  const gnuCommands = commandSpecificationsFor(gnuBreProfile);
  const gnuOnlyCommands = ["e", "F", "Q", "R", "T", "v", "W", "z"];

  assert.strictEqual(posixCommands, commandSpecifications);
  for (const command of gnuOnlyCommands) {
    assert.equal(
      posixCommands.find((specification) => specification.command === command),
      undefined,
    );
  }
  assert.equal(
    gnuCommands.find(({ command }) => command === ":").documentation,
    "Define a label for b, t, and T branches.",
  );
  assert.equal(
    gnuCommands.find(({ command }) => command === "t").documentation,
    "Branch if a substitution has occurred since the latest input read or conditional branch.",
  );
  assert.deepEqual(
    gnuCommands.filter(({ command }) => gnuOnlyCommands.includes(command)),
    [
      {
        command: "e",
        kind: "shell",
        maximumAddresses: 2,
        documentation:
          "Execute shell command text, or execute the pattern space when omitted.",
      },
      {
        command: "F",
        kind: "simple",
        maximumAddresses: 2,
        documentation: "Write the current input filename.",
      },
      {
        command: "Q",
        kind: "numeric",
        maximumAddresses: 1,
        documentation:
          "Quit without writing the pattern space, optionally returning an exit status.",
      },
      {
        command: "R",
        kind: "file",
        maximumAddresses: 2,
        documentation: "Queue the next line from a file for output.",
      },
      {
        command: "T",
        kind: "label",
        maximumAddresses: 2,
        documentation:
          "Branch if no substitution has occurred since the latest input read or conditional branch.",
      },
      {
        command: "v",
        kind: "version",
        maximumAddresses: 2,
        documentation: "Require GNU sed, optionally at a minimum version.",
      },
      {
        command: "W",
        kind: "file",
        maximumAddresses: 2,
        documentation:
          "Append the pattern space through its first newline to a file.",
      },
      {
        command: "z",
        kind: "simple",
        maximumAddresses: 2,
        documentation: "Empty the pattern space.",
      },
    ],
  );
});

test("explicit POSIX BRE profiles preserve the shared scanner defaults", () => {
  const address = String.raw`/\(a\)\1/p`;
  const expectedAddress = {
    kind: "valid",
    addressKind: "regular-expression",
    delimiter: { value: "/", width: 1 },
    delimiterOffset: 0,
    endOffset: 9,
    isUndefined: false,
    modifiers: [],
    patternEndOffset: 8,
    patternStartOffset: 1,
    startOffset: 0,
    value: String.raw`\(a\)\1`,
  };

  assert.deepEqual(
    scanAddressSyntax(address, 0, address.length),
    expectedAddress,
  );
  assert.deepEqual(
    scanAddressSyntax(address, 0, address.length, posixBreProfile),
    expectedAddress,
  );

  const pattern = String.raw`a\/b/`;
  const expectedPattern = {
    closingOffset: 4,
    hasUnclosedBracketExpression: false,
    possibleClosingOffset: null,
  };

  assert.deepEqual(
    scanRegexDelimiter(pattern, 0, pattern.length, characterAt("/", 0)),
    expectedPattern,
  );
  assert.deepEqual(
    scanRegexDelimiter(
      pattern,
      0,
      pattern.length,
      characterAt("/", 0),
      posixBreProfile,
    ),
    expectedPattern,
  );
});

test("returns structured values for every POSIX address kind", async (t) => {
  await t.test("line number", () => {
    assert.deepEqual(scanAddressSyntax("42p", 0, 3), {
      kind: "valid",
      addressKind: "line-number",
      endOffset: 2,
      isUndefined: false,
      modifiers: [],
      startOffset: 0,
      value: "42",
    });
  });

  await t.test("last line", () => {
    assert.deepEqual(scanAddressSyntax("$p", 0, 2), {
      kind: "valid",
      addressKind: "last-line",
      endOffset: 1,
      isUndefined: false,
      modifiers: [],
      startOffset: 0,
      value: "$",
    });
  });

  await t.test("regular expression", () => {
    assert.deepEqual(scanAddressSyntax("/foo/p", 0, 6), {
      kind: "valid",
      addressKind: "regular-expression",
      delimiter: { value: "/", width: 1 },
      delimiterOffset: 0,
      endOffset: 5,
      isUndefined: false,
      modifiers: [],
      patternEndOffset: 4,
      patternStartOffset: 1,
      startOffset: 0,
      value: "foo",
    });
  });
});

test("returns structured values for GNU numeric address extensions", async (t) => {
  await t.test("line number with a step", () => {
    assert.deepEqual(scanAddressSyntax("42~3p", 0, 5, gnuBreProfile), {
      kind: "valid",
      addressKind: "line-number-step",
      endOffset: 4,
      isUndefined: false,
      modifiers: [],
      operatorOffset: 2,
      startOffset: 0,
      stepEndOffset: 4,
      stepStartOffset: 3,
      value: { first: "42", step: "3" },
    });
  });

  await t.test("line number and step separated by blanks", () => {
    assert.deepEqual(scanAddressSyntax("0 ~ 2p", 0, 6, gnuBreProfile), {
      kind: "valid",
      addressKind: "line-number-step",
      endOffset: 5,
      isUndefined: false,
      modifiers: [],
      operatorOffset: 2,
      startOffset: 0,
      stepEndOffset: 5,
      stepStartOffset: 4,
      value: { first: "0", step: "2" },
    });
  });

  await t.test("relative line count", () => {
    assert.deepEqual(scanAddressSyntax("+ 12p", 0, 5, gnuBreProfile), {
      kind: "valid",
      addressKind: "relative-line-count",
      endOffset: 4,
      isUndefined: false,
      modifiers: [],
      operatorOffset: 0,
      startOffset: 0,
      value: "12",
      valueEndOffset: 4,
      valueStartOffset: 2,
    });
  });

  await t.test("relative line-number multiple", () => {
    assert.deepEqual(scanAddressSyntax("~0p", 0, 3, gnuBreProfile), {
      kind: "valid",
      addressKind: "relative-line-multiple",
      endOffset: 2,
      isUndefined: false,
      modifiers: [],
      operatorOffset: 0,
      startOffset: 0,
      value: "0",
      valueEndOffset: 2,
      valueStartOffset: 1,
    });
  });
});

test("returns GNU regexp address modifiers with their source ranges", () => {
  assert.deepEqual(scanAddressSyntax("/foo/ I M p", 0, 11, gnuBreProfile), {
    kind: "valid",
    addressKind: "regular-expression",
    delimiter: { value: "/", width: 1 },
    delimiterOffset: 0,
    endOffset: 9,
    isUndefined: false,
    modifiers: [
      { endOffset: 7, startOffset: 6, value: "I" },
      { endOffset: 9, startOffset: 8, value: "M" },
    ],
    patternEndOffset: 4,
    patternStartOffset: 1,
    startOffset: 0,
    value: "foo",
  });
});

test("accepts a backslash regexp delimiter only in GNU mode", () => {
  const source = String.raw`\\x\Ip`;

  assert.deepEqual(scanAddressSyntax(source, 0, source.length, gnuBreProfile), {
    kind: "valid",
    addressKind: "regular-expression",
    delimiter: { value: "\\", width: 1 },
    delimiterOffset: 1,
    endOffset: 5,
    isUndefined: false,
    modifiers: [{ endOffset: 5, startOffset: 4, value: "I" }],
    patternEndOffset: 3,
    patternStartOffset: 2,
    startOffset: 0,
    value: "x",
  });
  assert.deepEqual(
    scanAddressSyntax(source, 0, source.length, posixBreProfile),
    {
      kind: "invalid",
      delimiter: { value: "\\", width: 1 },
      delimiterOffset: 1,
      reason: "invalid-delimiter",
    },
  );
});

test("selects command-boundary policies from the syntax profile", () => {
  assert.deepEqual(syntaxPolicyFor(posixBreProfile), {
    address: {
      backslashRegexpDelimiter: false,
      numericStep: false,
      rangeOffsets: false,
      regexpModifiers: "",
    },
    commandEnd: {
      closingBraceTerminates: false,
      commentTerminates: false,
      rejectsTrailingBlanksInBlock: true,
    },
    filename: {
      opaqueUntil: "physical-line",
      separator: "blank-required",
    },
    label: {
      boundary: "physical-line",
      branchSeparator: "literal-space",
      normalization: "preserve-trailing-blanks",
    },
    numericArguments: "",
    regexp: {
      escapedPhysicalNewlines: false,
    },
    shell: {
      inline: false,
      opaqueUntil: null,
    },
    substituteFlags: {
      separator: "none",
    },
    text: {
      inline: false,
      opaqueUntil: "physical-line",
    },
  });
  assert.deepEqual(syntaxPolicyFor(gnuBreProfile), {
    address: {
      backslashRegexpDelimiter: true,
      numericStep: true,
      rangeOffsets: true,
      regexpModifiers: "IM",
    },
    commandEnd: {
      closingBraceTerminates: true,
      commentTerminates: true,
      rejectsTrailingBlanksInBlock: false,
    },
    filename: {
      opaqueUntil: "physical-line",
      separator: "optional-blanks",
    },
    label: {
      boundary: "gnu-token",
      branchSeparator: "optional-blanks",
      normalization: "trim-syntactic-blanks",
    },
    numericArguments: "lqQ",
    regexp: {
      escapedPhysicalNewlines: true,
    },
    shell: {
      inline: true,
      opaqueUntil: "escaped-newline-continuation",
    },
    substituteFlags: {
      separator: "optional-blanks",
    },
    text: {
      inline: true,
      opaqueUntil: "physical-line",
    },
  });
});

test("recognizes GNU closing braces and comments as direct command endings", () => {
  assert.deepEqual(scanCommandEndSyntax("p}", 1, 2, posixBreProfile), {
    kind: "unexpected",
    nextCommandBoundary: null,
    nextCommandOffset: null,
    startOffset: 1,
    endOffset: 2,
  });
  assert.deepEqual(scanCommandEndSyntax("p}", 1, 2, gnuBreProfile), {
    kind: "valid",
    nextCommandBoundary: "direct",
    nextCommandOffset: 1,
    terminator: "closing-brace",
  });

  assert.deepEqual(scanCommandEndSyntax("p# comment", 1, 10, posixBreProfile), {
    kind: "unexpected",
    nextCommandBoundary: null,
    nextCommandOffset: null,
    startOffset: 1,
    endOffset: 10,
  });
  assert.deepEqual(scanCommandEndSyntax("p# comment", 1, 10, gnuBreProfile), {
    kind: "valid",
    nextCommandBoundary: null,
    nextCommandOffset: null,
    terminator: "comment",
  });
});

test("recovers only at real profile-specific command boundaries", () => {
  const commandBeforeComment = "extra# comment;p";

  assert.deepEqual(
    scanCommandRecoverySyntax(
      commandBeforeComment,
      0,
      commandBeforeComment.length,
      gnuBreProfile,
    ),
    {
      nextCommandBoundary: null,
      nextCommandOffset: null,
      recoveryOffset: 5,
      terminator: "comment",
    },
  );
  assert.deepEqual(scanCommandRecoverySyntax("extra}", 0, 6, gnuBreProfile), {
    nextCommandBoundary: "recovered",
    nextCommandOffset: 5,
    recoveryOffset: 5,
    terminator: "closing-brace",
  });
  assert.deepEqual(scanCommandRecoverySyntax("extra}", 0, 6, posixBreProfile), {
    nextCommandBoundary: null,
    nextCommandOffset: null,
    recoveryOffset: null,
    terminator: null,
  });
});

test("allows trailing blanks before a GNU block boundary", () => {
  assert.deepEqual(
    scanCommandEndSyntax("p ", 1, 2, posixBreProfile, {
      insideBlock: true,
    }),
    {
      kind: "unexpected",
      nextCommandBoundary: null,
      nextCommandOffset: null,
      startOffset: 1,
      endOffset: 2,
    },
  );
  assert.deepEqual(
    scanCommandEndSyntax("p ", 1, 2, gnuBreProfile, {
      insideBlock: true,
    }),
    {
      kind: "valid",
      nextCommandBoundary: null,
      nextCommandOffset: null,
      terminator: "physical-line",
    },
  );
});

test("keeps POSIX labels physical-line sensitive and tokenizes GNU labels", () => {
  const source = "bloop ;p";

  assert.deepEqual(
    scanLabelArgumentSyntax(source, 0, source.length, posixBreProfile),
    {
      branchContextStartOffset: null,
      fieldEndOffset: 8,
      fieldStartOffset: 1,
      hasLabel: true,
      hasValidSeparator: false,
      labelEndOffset: 8,
      labelStartOffset: 1,
      name: "loop ;p",
      nextCommandBoundary: null,
      nextCommandOffset: null,
      terminator: "physical-line",
      terminatorOffset: 8,
    },
  );
  assert.deepEqual(
    scanLabelArgumentSyntax(source, 0, source.length, gnuBreProfile),
    {
      branchContextStartOffset: 1,
      fieldEndOffset: 6,
      fieldStartOffset: 1,
      hasLabel: true,
      hasValidSeparator: true,
      labelEndOffset: 5,
      labelStartOffset: 1,
      name: "loop",
      nextCommandBoundary: "separated",
      nextCommandOffset: 7,
      terminator: "semicolon",
      terminatorOffset: 6,
    },
  );
});

test("makes blanks before GNU filename arguments optional", () => {
  const source = "rfile; p";
  const commonResult = {
    fieldStartOffset: 1,
    filenameEndOffset: 8,
    filenameStartOffset: 1,
    hasName: true,
    name: "file; p",
    opaqueUntil: "physical-line",
  };

  assert.deepEqual(
    scanFilenameArgumentSyntax(source, 0, source.length, posixBreProfile),
    {
      ...commonResult,
      hasValidSeparator: false,
    },
  );
  assert.deepEqual(
    scanFilenameArgumentSyntax(source, 0, source.length, gnuBreProfile),
    {
      ...commonResult,
      hasValidSeparator: true,
    },
  );
});

test("accepts GNU inline text while retaining portable text syntax", () => {
  const inlineSource = "a text;}";

  assert.deepEqual(
    scanTextCommandSyntax(
      inlineSource,
      0,
      inlineSource.length,
      true,
      posixBreProfile,
    ),
    {
      kind: "invalid",
      reason: "missing-backslash",
      startOffset: 0,
      endOffset: 1,
    },
  );
  assert.deepEqual(
    scanTextCommandSyntax(
      inlineSource,
      0,
      inlineSource.length,
      true,
      gnuBreProfile,
    ),
    {
      kind: "inline",
      consumesFollowingTextLine: false,
      allowsMissingFollowingTextLine: true,
      textStartOffset: 2,
      textEndOffset: 8,
    },
  );

  assert.deepEqual(scanTextCommandSyntax("a\\", 0, 2, true, posixBreProfile), {
    kind: "portable",
    backslashOffset: 1,
    consumesFollowingTextLine: true,
    allowsMissingFollowingTextLine: false,
  });
  assert.deepEqual(scanTextCommandSyntax("a\\", 0, 2, true, gnuBreProfile), {
    kind: "portable",
    backslashOffset: 1,
    consumesFollowingTextLine: true,
    allowsMissingFollowingTextLine: true,
  });
});

test("distinguishes a leading literal backslash from a GNU text continuation", () => {
  const twoBackslashes = `a${"\\".repeat(2)}`;
  const threeBackslashes = `a${"\\".repeat(3)}`;

  assert.equal(
    scanTextCommandSyntax(
      twoBackslashes,
      0,
      twoBackslashes.length,
      true,
      gnuBreProfile,
    ).consumesFollowingTextLine,
    false,
  );
  assert.equal(
    scanTextCommandSyntax(
      threeBackslashes,
      0,
      threeBackslashes.length,
      true,
      gnuBreProfile,
    ).consumesFollowingTextLine,
    true,
  );
});

test("keeps GNU shell command text opaque through escaped newlines", () => {
  const inlineShell = "e echo; } # shell";
  assert.deepEqual(
    scanShellCommandSyntax(
      inlineShell,
      0,
      inlineShell.length,
      true,
      gnuBreProfile,
    ),
    {
      kind: "inline",
      consumesFollowingTextLine: false,
      fieldStartOffset: 1,
      shellEndOffset: inlineShell.length,
      shellStartOffset: 2,
    },
  );

  const continuedShell = `e echo ${"\\"}`;
  assert.equal(
    scanShellCommandSyntax(
      continuedShell,
      0,
      continuedShell.length,
      true,
      gnuBreProfile,
    ).consumesFollowingTextLine,
    true,
  );

  assert.deepEqual(scanShellCommandSyntax("e", 0, 1, false, gnuBreProfile), {
    kind: "empty",
    consumesFollowingTextLine: false,
    fieldStartOffset: 1,
    shellEndOffset: 1,
    shellStartOffset: 1,
  });
  assert.deepEqual(
    scanShellCommandSyntax("e echo", 0, 6, false, posixBreProfile),
    {
      kind: "unsupported",
      consumesFollowingTextLine: false,
      fieldStartOffset: 1,
    },
  );
});

test("distinguishes GNU shell continuation syntax from a leading literal backslash", () => {
  for (const [backslashCount, consumesFollowingTextLine] of [
    [1, true],
    [2, false],
    [3, true],
  ]) {
    const source = `e${"\\".repeat(backslashCount)}`;
    assert.equal(
      scanShellCommandSyntax(source, 0, source.length, true, gnuBreProfile)
        .consumesFollowingTextLine,
      consumesFollowingTextLine,
    );
  }
});

test("compares GNU version tokens against the 4.10 target", () => {
  assert.equal(gnuSedTargetVersion, "4.10");

  for (const version of ["4", "4.0", "4.9", "4.10", "4.010", "4..1", "-1"]) {
    assert.equal(isGnuSedVersionSupported(version), true, version);
  }
  for (const version of ["4.10.0", "4.11", "5", "banana", "4x"]) {
    assert.equal(isGnuSedVersionSupported(version), false, version);
  }
});

test("uses GNU label boundaries for version arguments", () => {
  assert.deepEqual(scanVersionArgumentSyntax("v4.10;p", 0, 8, gnuBreProfile), {
    comparedVersion: "4.10",
    endOffset: 5,
    hasArgument: true,
    isSupported: true,
    nextCommandBoundary: "separated",
    nextCommandOffset: 6,
    startOffset: 1,
    terminator: "semicolon",
    value: "4.10",
  });
  assert.deepEqual(scanVersionArgumentSyntax("v", 0, 1, gnuBreProfile), {
    comparedVersion: "4.0",
    endOffset: 1,
    hasArgument: false,
    isSupported: true,
    nextCommandBoundary: null,
    nextCommandOffset: null,
    startOffset: 1,
    terminator: "physical-line",
    value: null,
  });
});

test("scans optional decimal arguments only for GNU l, q, and Q commands", async (t) => {
  const cases = [
    {
      name: "line-wrap length",
      source: "l0}",
      posix: {
        argumentEndOffset: 1,
        argumentStartOffset: 1,
        commandEndOffset: 1,
        hasArgument: false,
        value: null,
      },
      gnu: {
        argumentEndOffset: 2,
        argumentStartOffset: 1,
        commandEndOffset: 2,
        hasArgument: true,
        value: "0",
      },
    },
    {
      name: "quit status after blanks",
      source: "q 42;p",
      posix: {
        argumentEndOffset: 2,
        argumentStartOffset: 2,
        commandEndOffset: 1,
        hasArgument: false,
        value: null,
      },
      gnu: {
        argumentEndOffset: 4,
        argumentStartOffset: 2,
        commandEndOffset: 4,
        hasArgument: true,
        value: "42",
      },
    },
    {
      name: "silent quit status",
      source: "Q000;p",
      posix: {
        argumentEndOffset: 1,
        argumentStartOffset: 1,
        commandEndOffset: 1,
        hasArgument: false,
        value: null,
      },
      gnu: {
        argumentEndOffset: 4,
        argumentStartOffset: 1,
        commandEndOffset: 4,
        hasArgument: true,
        value: "000",
      },
    },
  ];

  for (const { name, source, posix, gnu } of cases) {
    await t.test(name, () => {
      assert.deepEqual(
        scanOptionalNumericArgumentSyntax(
          source,
          0,
          source.length,
          posixBreProfile,
        ),
        posix,
      );
      assert.deepEqual(
        scanOptionalNumericArgumentSyntax(
          source,
          0,
          source.length,
          gnuBreProfile,
        ),
        gnu,
      );
    });
  }
});

test("recovers an undefined context address at a delimiter outside bracket elements", async (t) => {
  const addresses = [
    {
      name: "collating-symbol expression",
      source: "/[[./.]/p",
      patternEndOffset: 7,
    },
    {
      name: "equivalence-class expression",
      source: "/[[=/=]/p",
      patternEndOffset: 7,
    },
    {
      name: "negation character matching the alternate delimiter",
      source: "\\^[^foo^p",
      patternEndOffset: 7,
    },
  ];

  for (const { name, source, patternEndOffset } of addresses) {
    await t.test(name, () => {
      assert.deepEqual(scanAddressSyntax(source, 0, source.length), {
        kind: "valid",
        addressKind: "regular-expression",
        delimiter: characterAt(source, source[0] === "/" ? 0 : 1),
        delimiterOffset: source[0] === "/" ? 0 : 1,
        endOffset: patternEndOffset + 1,
        isUndefined: true,
        modifiers: [],
        patternEndOffset,
        patternStartOffset: source[0] === "/" ? 1 : 2,
        startOffset: 0,
        value: source.slice(source[0] === "/" ? 1 : 2, patternEndOffset),
      });
    });
  }
});

test("uses only unescaped delimiters to recover an unfinished bracket expression", async (t) => {
  const cases = [
    {
      name: "delimiter after one backslash",
      source: String.raw`/[\/z`,
      expected: {
        closingOffset: null,
        hasUnclosedBracketExpression: true,
        possibleClosingOffset: null,
      },
    },
    {
      name: "unescaped delimiter after an escaped delimiter",
      source: String.raw`/[\/x/z`,
      expected: {
        closingOffset: null,
        hasUnclosedBracketExpression: true,
        possibleClosingOffset: 5,
      },
    },
    {
      name: "delimiter after two backslashes",
      source: String.raw`/[\\/z`,
      expected: {
        closingOffset: null,
        hasUnclosedBracketExpression: true,
        possibleClosingOffset: 4,
      },
    },
  ];

  for (const { name, source, expected } of cases) {
    await t.test(name, () => {
      assert.deepEqual(
        scanRegexDelimiter(source, 1, source.length, characterAt(source, 0)),
        expected,
      );
    });
  }
});

test("leaves an escaped left-bracket delimiter indeterminate", () => {
  const source = String.raw`s[\[x[y[z`;

  assert.deepEqual(
    scanRegexDelimiter(source, 2, source.length, characterAt(source, 1)),
    {
      closingOffset: null,
      hasUnclosedBracketExpression: false,
      isDelimiterInterpretationUnspecified: true,
      possibleClosingOffset: null,
    },
  );
});

test("scans a long unfinished bracket element in linear time", () => {
  const source = `/${"[.".repeat(50_000)}/p`;
  const delimiter = characterAt(source, 0);
  const startedAt = performance.now();

  const result = scanRegexDelimiter(source, 1, source.length, delimiter);
  const elapsedMilliseconds = performance.now() - startedAt;

  assert.deepEqual(result, {
    closingOffset: null,
    hasUnclosedBracketExpression: true,
    possibleClosingOffset: null,
  });
  assert.ok(
    elapsedMilliseconds < 500,
    `expected a linear scan under 500 ms, received ${elapsedMilliseconds.toFixed(1)} ms`,
  );
});

test("scans long GNU stepped addresses in linear time", () => {
  const first = "9".repeat(50_000);
  const step = "8".repeat(50_000);
  const source = `${first} ~ ${step}p`;
  const startedAt = performance.now();

  const result = scanAddressSyntax(source, 0, source.length, gnuBreProfile);
  const elapsedMilliseconds = performance.now() - startedAt;

  assert.equal(result.kind, "valid");
  assert.equal(result.addressKind, "line-number-step");
  assert.deepEqual(result.value, { first, step });
  assert.equal(result.endOffset, source.length - 1);
  assert.ok(
    elapsedMilliseconds < 500,
    `expected a linear scan under 500 ms, received ${elapsedMilliseconds.toFixed(1)} ms`,
  );
});
