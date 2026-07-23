import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultSyntaxProfile,
  requireSyntaxProfile,
  resolveSyntaxProfile,
} from "../src/syntax-profile.js";

test("uses the POSIX BRE profile when options are omitted", () => {
  assert.deepEqual(resolveSyntaxProfile(), {
    ok: true,
    profile: {
      dialect: "posix",
      regexpMode: "bre",
    },
  });
});

test("uses the POSIX BRE profile when options are null", () => {
  assert.deepEqual(resolveSyntaxProfile(null), {
    ok: true,
    profile: {
      dialect: "posix",
      regexpMode: "bre",
    },
  });
});

test("uses defaults for individual options that are omitted", async (t) => {
  const cases = [
    {
      name: "empty options",
      options: {},
      expectedProfile: { dialect: "posix", regexpMode: "bre" },
    },
    {
      name: "only GNU dialect",
      options: { dialect: "gnu" },
      expectedProfile: { dialect: "gnu", regexpMode: "bre" },
    },
    {
      name: "only ERE mode",
      options: { regexpMode: "ere" },
      expectedProfile: { dialect: "posix", regexpMode: "ere" },
    },
    {
      name: "explicitly undefined options",
      options: { dialect: undefined, regexpMode: undefined },
      expectedProfile: { dialect: "posix", regexpMode: "bre" },
    },
  ];

  for (const { name, options, expectedProfile } of cases) {
    await t.test(name, () => {
      assert.deepEqual(resolveSyntaxProfile(options), {
        ok: true,
        profile: expectedProfile,
      });
    });
  }
});

test("resolves every supported dialect and regular-expression mode", async (t) => {
  for (const dialect of ["posix", "gnu"]) {
    for (const regexpMode of ["bre", "ere"]) {
      await t.test(`${dialect} with ${regexpMode}`, () => {
        assert.deepEqual(resolveSyntaxProfile({ dialect, regexpMode }), {
          ok: true,
          profile: { dialect, regexpMode },
        });
      });
    }
  }
});

test("returns an explicit error for an invalid dialect", () => {
  assert.deepEqual(resolveSyntaxProfile({ dialect: "bsd" }), {
    ok: false,
    errors: [
      {
        code: "syntax-profile-invalid-dialect",
        option: "dialect",
        received: "bsd",
        expected: ["posix", "gnu"],
        message: 'The syntax profile dialect must be either "posix" or "gnu".',
      },
    ],
  });
});

test("returns an explicit error for an invalid regular-expression mode", () => {
  assert.deepEqual(resolveSyntaxProfile({ regexpMode: "extended" }), {
    ok: false,
    errors: [
      {
        code: "syntax-profile-invalid-regexp-mode",
        option: "regexpMode",
        received: "extended",
        expected: ["bre", "ere"],
        message: 'The syntax profile regexpMode must be either "bre" or "ere".',
      },
    ],
  });
});

test("returns every invalid option in one result", () => {
  assert.deepEqual(resolveSyntaxProfile({ dialect: null, regexpMode: null }), {
    ok: false,
    errors: [
      {
        code: "syntax-profile-invalid-dialect",
        option: "dialect",
        received: null,
        expected: ["posix", "gnu"],
        message: 'The syntax profile dialect must be either "posix" or "gnu".',
      },
      {
        code: "syntax-profile-invalid-regexp-mode",
        option: "regexpMode",
        received: null,
        expected: ["bre", "ere"],
        message: 'The syntax profile regexpMode must be either "bre" or "ere".',
      },
    ],
  });
});

test("returns an explicit error when options are neither an object nor null", async (t) => {
  for (const options of ["gnu", []]) {
    await t.test(JSON.stringify(options), () => {
      assert.deepEqual(resolveSyntaxProfile(options), {
        ok: false,
        errors: [
          {
            code: "syntax-profile-invalid-options",
            option: null,
            received: options,
            expected: "an options object or null",
            message:
              "Syntax profile options must be provided as an object or null.",
          },
        ],
      });
    });
  }
});

test("returns immutable syntax profiles", () => {
  const result = resolveSyntaxProfile({
    dialect: "gnu",
    regexpMode: "ere",
  });

  assert.equal(Object.isFrozen(defaultSyntaxProfile), true);
  assert.equal(result.ok, true);
  assert.equal(Object.isFrozen(result.profile), true);
  assert.throws(() => {
    result.profile.dialect = "posix";
  }, TypeError);
  assert.deepEqual(result.profile, {
    dialect: "gnu",
    regexpMode: "ere",
  });
});

test("requires a canonical immutable profile for internal analysis APIs", () => {
  const first = requireSyntaxProfile({ dialect: "gnu", regexpMode: "bre" });
  const second = requireSyntaxProfile({ dialect: "gnu", regexpMode: "bre" });

  assert.equal(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.throws(
    () => requireSyntaxProfile({ dialect: "bsd" }),
    new TypeError(
      'The syntax profile dialect must be either "posix" or "gnu".',
    ),
  );
});
