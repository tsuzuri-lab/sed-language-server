const dialects = Object.freeze(["posix", "gnu"]);
const regexpModes = Object.freeze(["bre", "ere"]);

const profiles = Object.freeze({
  "posix:bre": Object.freeze({ dialect: "posix", regexpMode: "bre" }),
  "posix:ere": Object.freeze({ dialect: "posix", regexpMode: "ere" }),
  "gnu:bre": Object.freeze({ dialect: "gnu", regexpMode: "bre" }),
  "gnu:ere": Object.freeze({ dialect: "gnu", regexpMode: "ere" }),
});

export const defaultSyntaxProfile = profiles["posix:bre"];

function successfulResult(profile) {
  return Object.freeze({ ok: true, profile });
}

function failedResult(errors) {
  return Object.freeze({ ok: false, errors: Object.freeze(errors) });
}

function invalidOption(code, option, received, expected, message) {
  return Object.freeze({
    code,
    option,
    received,
    expected,
    message,
  });
}

export function resolveSyntaxProfile(options) {
  if (options === undefined || options === null) {
    return successfulResult(defaultSyntaxProfile);
  }

  if (typeof options !== "object" || Array.isArray(options)) {
    return failedResult([
      invalidOption(
        "syntax-profile-invalid-options",
        null,
        options,
        "an options object or null",
        "Syntax profile options must be provided as an object or null.",
      ),
    ]);
  }

  const dialect =
    options.dialect === undefined
      ? defaultSyntaxProfile.dialect
      : options.dialect;
  const regexpMode =
    options.regexpMode === undefined
      ? defaultSyntaxProfile.regexpMode
      : options.regexpMode;
  const errors = [];

  if (!dialects.includes(dialect)) {
    errors.push(
      invalidOption(
        "syntax-profile-invalid-dialect",
        "dialect",
        dialect,
        dialects,
        'The syntax profile dialect must be either "posix" or "gnu".',
      ),
    );
  }

  if (!regexpModes.includes(regexpMode)) {
    errors.push(
      invalidOption(
        "syntax-profile-invalid-regexp-mode",
        "regexpMode",
        regexpMode,
        regexpModes,
        'The syntax profile regexpMode must be either "bre" or "ere".',
      ),
    );
  }

  if (errors.length > 0) {
    return failedResult(errors);
  }

  return successfulResult(profiles[`${dialect}:${regexpMode}`]);
}

export function requireSyntaxProfile(options) {
  const result = resolveSyntaxProfile(options);
  if (!result.ok) {
    throw new TypeError(result.errors.map(({ message }) => message).join(" "));
  }
  return result.profile;
}
