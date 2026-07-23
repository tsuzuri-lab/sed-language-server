#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  gnuManualAcceptanceCorpus,
  gnuManualRejectionCorpus,
} from "../test/fixtures/gnu-manual-corpus.js";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

const executable = process.argv[2];
if (executable === undefined || process.argv.length !== 3) {
  fail(
    "Usage: node scripts/compare-gnu-manual-corpus.js /path/to/gnu-sed-4.10",
  );
} else {
  const oracleEnvironment = { ...process.env, LC_ALL: "C" };
  delete oracleEnvironment.POSIXLY_CORRECT;
  const version = spawnSync(executable, ["--version"], {
    encoding: "utf8",
    env: oracleEnvironment,
    timeout: 5_000,
  });

  if (version.error !== undefined) {
    fail(`Could not run ${executable}: ${version.error.message}`);
  } else if (version.signal !== null) {
    fail(`${executable} --version was terminated by ${version.signal}.`);
  } else if (version.status !== 0) {
    fail(`${executable} --version exited with status ${version.status}.`);
  } else {
    const versionLine = version.stdout.split(/\r?\n/, 1)[0];
    if (!versionLine.endsWith("(GNU sed) 4.10")) {
      fail(`Expected GNU sed 4.10, received: ${versionLine}`);
    } else {
      const corpus = [
        ...gnuManualAcceptanceCorpus.map((example) => ({
          ...example,
          accepted: true,
        })),
        ...gnuManualRejectionCorpus.map((example) => ({
          ...example,
          accepted: false,
        })),
      ];
      const failures = [];
      for (const example of corpus) {
        const result = spawnSync(
          executable,
          ["--sandbox", "--quiet", "--expression", example.source],
          {
            encoding: "utf8",
            env: oracleEnvironment,
            input: "",
            timeout: 5_000,
          },
        );
        if (
          result.error !== undefined ||
          result.signal !== null ||
          result.status === null
        ) {
          failures.push({
            example,
            message:
              result.error?.message ??
              (result.signal === null
                ? "the process ended without an exit status"
                : `the process was terminated by ${result.signal}`),
          });
          continue;
        }

        const accepted = result.status === 0;
        if (accepted !== example.accepted) {
          failures.push({
            example,
            message:
              result.stderr.trim() || `unexpected exit status ${result.status}`,
          });
        }
      }

      if (failures.length > 0) {
        for (const { example, message } of failures) {
          fail(`${example.manualSection}: ${example.name}: ${message}`);
        }
      } else {
        process.stdout.write(
          `Verified ${corpus.length} manual examples with GNU sed 4.10.\n`,
        );
      }
    }
  }
}
