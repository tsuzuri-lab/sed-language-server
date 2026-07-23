import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createMessageConnection,
  DiagnosticSeverity,
  ErrorCodes,
  MessageType,
  StreamMessageReader,
  StreamMessageWriter,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const serverPath = fileURLToPath(
  new URL(`../${packageJson.bin["sed-language-server"]}`, import.meta.url),
);
const requestTimeoutMilliseconds = 5_000;

function timeoutError(operation, stderr) {
  const details = stderr === "" ? "" : `\nServer stderr:\n${stderr}`;
  return new Error(`Timed out while waiting for ${operation}.${details}`);
}

class LspClient {
  constructor(serverArguments) {
    this.process = spawn(process.execPath, [serverPath, ...serverArguments], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.stderr = "";
    this.notificationWaiters = [];
    this.queuedNotifications = [];
    this.process.stderr.setEncoding("utf8");
    this.process.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.exit = new Promise((resolve) => {
      this.process.once("error", (error) => {
        resolve({ code: null, signal: null, error });
      });
      this.process.once("exit", (code, signal) => {
        resolve({ code, signal, error: undefined });
      });
    });

    this.connection = createMessageConnection(
      new StreamMessageReader(this.process.stdout),
      new StreamMessageWriter(this.process.stdin),
    );
    this.connection.onNotification((method, params) => {
      const waiterIndex = this.notificationWaiters.findIndex(
        (waiter) => waiter.method === method && waiter.predicate(params),
      );
      if (waiterIndex === -1) {
        this.queuedNotifications.push({ method, params });
        return;
      }

      const [waiter] = this.notificationWaiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(params);
    });
    this.connection.listen();
  }

  request(method, params) {
    return this.withTimeout(
      this.connection.sendRequest(method, params),
      `response to ${method}`,
    );
  }

  notify(method, params) {
    return this.withTimeout(
      this.connection.sendNotification(method, params),
      `delivery of ${method}`,
    );
  }

  waitForNotification(method, predicate = () => true) {
    const queuedIndex = this.queuedNotifications.findIndex(
      (message) => message.method === method && predicate(message.params),
    );
    if (queuedIndex !== -1) {
      const [message] = this.queuedNotifications.splice(queuedIndex, 1);
      return Promise.resolve(message.params);
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        method,
        predicate,
        resolve,
        reject,
        timer: undefined,
      };
      waiter.timer = setTimeout(() => {
        const index = this.notificationWaiters.indexOf(waiter);
        if (index !== -1) {
          this.notificationWaiters.splice(index, 1);
        }
        reject(timeoutError(`${method} notification`, this.stderr));
      }, requestTimeoutMilliseconds);
      this.notificationWaiters.push(waiter);
    });
  }

  waitForExit() {
    return this.withTimeout(this.exit, "language server to exit").then(
      ({ code, signal, error }) => {
        if (error !== undefined) {
          throw error;
        }
        return { code, signal };
      },
    );
  }

  withTimeout(promise, operation) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(timeoutError(operation, this.stderr));
      }, requestTimeoutMilliseconds);
      promise.then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  async dispose() {
    this.connection.dispose();
    for (const waiter of this.notificationWaiters) {
      clearTimeout(waiter.timer);
    }
    this.notificationWaiters = [];

    if (this.process.exitCode !== null || this.process.signalCode !== null) {
      return;
    }

    this.process.kill();
    try {
      await this.waitForExit();
    } catch {
      if (this.process.exitCode === null && this.process.signalCode === null) {
        this.process.kill("SIGKILL");
        try {
          await this.waitForExit();
        } catch {
          this.process.stdin.destroy();
          this.process.stdout.destroy();
          this.process.stderr.destroy();
          this.process.unref();
        }
      }
    }
  }
}

async function verifyLanguageServerWorkflow(t, serverArguments) {
  const client = new LspClient(serverArguments);
  t.after(() => client.dispose());

  const initializeResult = await client.request("initialize", {
    processId: process.pid,
    rootUri: null,
    capabilities: {},
  });
  assert.deepEqual(initializeResult.capabilities, {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    completionProvider: {},
    definitionProvider: true,
  });

  await client.notify("initialized", {});

  const uri = "file:///integration.sed";
  await client.notify("textDocument/didOpen", {
    textDocument: {
      uri,
      languageId: "sed",
      version: 1,
      text: ":loop\nb loop\nz\n",
    },
  });

  const openedDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri }) => diagnosticUri === uri,
  );
  assert.deepEqual(openedDiagnostics.diagnostics, [
    {
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 2, character: 0 },
        end: { line: 2, character: 1 },
      },
      message: "Unknown POSIX sed command: `z`.",
      code: "command-unknown",
      source: "sed-language-server",
    },
  ]);

  const completions = await client.request("textDocument/completion", {
    textDocument: { uri },
    position: { line: 1, character: 6 },
  });
  assert.equal(
    completions.some(({ label }) => label === "loop"),
    true,
    "completion should include the label defined in the open document",
  );

  const definitions = await client.request("textDocument/definition", {
    textDocument: { uri },
    position: { line: 1, character: 4 },
  });
  assert.deepEqual(definitions, [
    {
      uri,
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 5 },
      },
    },
  ]);

  await client.notify("textDocument/didChange", {
    textDocument: { uri, version: 2 },
    contentChanges: [
      {
        range: {
          start: { line: 0, character: 1 },
          end: { line: 0, character: 5 },
        },
        text: "next",
      },
      {
        range: {
          start: { line: 1, character: 2 },
          end: { line: 1, character: 6 },
        },
        text: "next",
      },
      {
        range: {
          start: { line: 2, character: 0 },
          end: { line: 2, character: 1 },
        },
        text: "Q",
      },
    ],
  });

  const changedDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri }) => diagnosticUri === uri,
  );
  assert.deepEqual(changedDiagnostics.diagnostics, [
    {
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 2, character: 0 },
        end: { line: 2, character: 1 },
      },
      message: "Unknown POSIX sed command: `Q`.",
      code: "command-unknown",
      source: "sed-language-server",
    },
  ]);

  const updatedCompletions = await client.request("textDocument/completion", {
    textDocument: { uri },
    position: { line: 1, character: 6 },
  });
  assert.deepEqual(
    updatedCompletions
      .filter(({ label }) => label === "loop" || label === "next")
      .map(({ label }) => label),
    ["next"],
  );

  const updatedDefinitions = await client.request("textDocument/definition", {
    textDocument: { uri },
    position: { line: 1, character: 4 },
  });
  assert.deepEqual(updatedDefinitions, [
    {
      uri,
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 5 },
      },
    },
  ]);

  await client.notify("textDocument/didClose", {
    textDocument: { uri },
  });

  const closedDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, diagnostics }) =>
      diagnosticUri === uri && diagnostics.length === 0,
  );
  assert.deepEqual(closedDiagnostics, {
    uri,
    diagnostics: [],
  });

  assert.equal(await client.request("shutdown"), null);
  await client.notify("exit");
  assert.deepEqual(await client.waitForExit(), {
    code: 0,
    signal: null,
  });
}

test("serves a complete LSP workflow over the default stdio transport", (t) =>
  verifyLanguageServerWorkflow(t, []));

test("serves a complete LSP workflow with an explicit --stdio argument", (t) =>
  verifyLanguageServerWorkflow(t, ["--stdio"]));

test("serves an integrated GNU workflow through incremental edits and reconfiguration", async (t) => {
  const client = new LspClient([]);
  t.after(() => client.dispose());

  await client.request("initialize", {
    processId: process.pid,
    rootUri: null,
    capabilities: {},
    initializationOptions: {
      dialect: "gnu",
      regexpMode: "bre",
    },
  });
  await client.notify("initialized", {});

  const uri = "file:///gnu-initialization.sed";
  await client.notify("textDocument/didOpen", {
    textDocument: {
      uri,
      languageId: "sed",
      version: 3,
      text: ": target\nb target\n{p\n}\nz\n/\\(x\\)\\1/p\ns/a/b/\n\n",
    },
  });

  const diagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri }) => diagnosticUri === uri,
  );
  assert.deepEqual(diagnostics.diagnostics, []);

  const completions = await client.request("textDocument/completion", {
    textDocument: { uri },
    position: { line: 7, character: 0 },
  });
  assert.equal(
    completions.some(({ label }) => label === "z"),
    true,
    "GNU command completion should include z",
  );

  const labelCompletions = await client.request("textDocument/completion", {
    textDocument: { uri },
    position: { line: 1, character: 7 },
  });
  assert.equal(
    labelCompletions.some(({ label }) => label === "target"),
    true,
    "GNU label completion should include the open document's target label",
  );

  const definitions = await client.request("textDocument/definition", {
    textDocument: { uri },
    position: { line: 1, character: 4 },
  });
  assert.deepEqual(definitions, [
    {
      uri,
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 8 },
      },
    },
  ]);

  await client.notify("textDocument/didChange", {
    textDocument: { uri, version: 4 },
    contentChanges: [
      {
        range: {
          start: { line: 0, character: 2 },
          end: { line: 0, character: 8 },
        },
        text: "next",
      },
      {
        range: {
          start: { line: 1, character: 2 },
          end: { line: 1, character: 8 },
        },
        text: "next",
      },
      {
        range: {
          start: { line: 4, character: 0 },
          end: { line: 4, character: 1 },
        },
        text: "L",
      },
    ],
  });
  const incrementalLabelCompletions = await client.request(
    "textDocument/completion",
    {
      textDocument: { uri },
      position: { line: 1, character: 4 },
    },
  );
  assert.deepEqual(
    incrementalLabelCompletions
      .filter(({ label }) => label === "target" || label === "next")
      .map(({ label }) => label),
    ["next"],
  );
  const incrementalDefinitions = await client.request(
    "textDocument/definition",
    {
      textDocument: { uri },
      position: { line: 1, character: 4 },
    },
  );
  assert.deepEqual(incrementalDefinitions, [
    {
      uri,
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 6 },
      },
    },
  ]);

  const incrementalDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, version }) => diagnosticUri === uri && version === 4,
  );
  assert.deepEqual(
    incrementalDiagnostics.diagnostics.map(({ code, range, severity }) => ({
      code,
      range,
      severity,
    })),
    [
      {
        code: "command-unknown",
        range: {
          start: { line: 4, character: 0 },
          end: { line: 4, character: 1 },
        },
        severity: DiagnosticSeverity.Error,
      },
    ],
  );

  await client.notify("textDocument/didChange", {
    textDocument: { uri, version: 5 },
    contentChanges: [
      {
        range: {
          start: { line: 0, character: 2 },
          end: { line: 0, character: 6 },
        },
        text: "target",
      },
      {
        range: {
          start: { line: 1, character: 2 },
          end: { line: 1, character: 6 },
        },
        text: "target",
      },
      {
        range: {
          start: { line: 4, character: 0 },
          end: { line: 4, character: 1 },
        },
        text: "z",
      },
    ],
  });
  const restoredDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, version }) => diagnosticUri === uri && version === 5,
  );
  assert.deepEqual(restoredDiagnostics.diagnostics, []);

  const ereDiagnosticsPromise = client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, version, diagnostics: nextDiagnostics }) =>
      diagnosticUri === uri &&
      version === 5 &&
      nextDiagnostics[0]?.code === "ere-invalid-back-reference",
  );
  await client.notify("workspace/didChangeConfiguration", {
    settings: {
      sedLanguageServer: {
        dialect: "gnu",
        regexpMode: "ere",
      },
    },
  });
  const ereDiagnostics = await ereDiagnosticsPromise;
  assert.deepEqual(
    ereDiagnostics.diagnostics.map(({ code, range, severity }) => ({
      code,
      range,
      severity,
    })),
    [
      {
        code: "ere-invalid-back-reference",
        range: {
          start: { line: 5, character: 6 },
          end: { line: 5, character: 8 },
        },
        severity: DiagnosticSeverity.Error,
      },
    ],
  );

  const ereCompletions = await client.request("textDocument/completion", {
    textDocument: { uri },
    position: { line: 7, character: 0 },
  });
  assert.equal(
    ereCompletions.some(({ label }) => label === "z"),
    true,
    "GNU ERE command completion should retain GNU commands",
  );
  const ereFlagCompletions = await client.request("textDocument/completion", {
    textDocument: { uri },
    position: { line: 6, character: 6 },
  });
  for (const flag of ["e", "I", "M", "m"]) {
    assert.equal(
      ereFlagCompletions.some(({ label }) => label === flag),
      true,
      flag,
    );
  }

  const posixDiagnosticsPromise = client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, version, diagnostics: nextDiagnostics }) =>
      diagnosticUri === uri &&
      version === 5 &&
      nextDiagnostics[0]?.code === "command-unknown",
  );
  await client.notify("workspace/didChangeConfiguration", {
    settings: {
      sedLanguageServer: {
        dialect: "posix",
        regexpMode: "bre",
      },
    },
  });
  const posixDiagnostics = await posixDiagnosticsPromise;
  assert.deepEqual(
    posixDiagnostics.diagnostics.map(({ code, range, severity }) => ({
      code,
      range,
      severity,
    })),
    [
      {
        code: "command-unknown",
        range: {
          start: { line: 4, character: 0 },
          end: { line: 4, character: 1 },
        },
        severity: DiagnosticSeverity.Error,
      },
    ],
  );

  const posixCompletions = await client.request("textDocument/completion", {
    textDocument: { uri },
    position: { line: 7, character: 0 },
  });
  assert.equal(
    posixCompletions.some(({ label }) => label === "z"),
    false,
    "POSIX command completion should exclude GNU commands",
  );
  const posixFlagCompletions = await client.request("textDocument/completion", {
    textDocument: { uri },
    position: { line: 6, character: 6 },
  });
  for (const flag of ["e", "I", "M", "m"]) {
    assert.equal(
      posixFlagCompletions.some(({ label }) => label === flag),
      false,
      flag,
    );
  }

  const finalDiagnosticsPromise = client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, version, diagnostics: nextDiagnostics }) =>
      diagnosticUri === uri && version === 5 && nextDiagnostics.length === 0,
  );
  await client.notify("workspace/didChangeConfiguration", {
    settings: {
      sedLanguageServer: {
        dialect: "gnu",
        regexpMode: "bre",
      },
    },
  });
  assert.deepEqual(await finalDiagnosticsPromise, {
    uri,
    version: 5,
    diagnostics: [],
  });

  assert.equal(await client.request("shutdown"), null);
  await client.notify("exit");
  assert.deepEqual(await client.waitForExit(), {
    code: 0,
    signal: null,
  });
});

test("serves phase 8 GNU commands through diagnostics and editor features", async (t) => {
  const client = new LspClient([]);
  t.after(() => client.dispose());

  await client.request("initialize", {
    processId: process.pid,
    rootUri: null,
    capabilities: {},
    initializationOptions: {
      dialect: "gnu",
      regexpMode: "bre",
    },
  });
  await client.notify("initialized", {});

  const uri = "file:///gnu-phase-8.sed";
  const validSource =
    ":target\n" +
    "e shell; } # opaque\n" +
    "F\n" +
    "Q42\n" +
    "R input; } # filename\n" +
    "T target\n" +
    "v4.10\n" +
    "W output; } # filename\n" +
    "z\n" +
    "\n";
  await client.notify("textDocument/didOpen", {
    textDocument: {
      uri,
      languageId: "sed",
      version: 1,
      text: validSource,
    },
  });

  const validDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, version }) => diagnosticUri === uri && version === 1,
  );
  assert.deepEqual(validDiagnostics.diagnostics, []);

  const completions = await client.request("textDocument/completion", {
    textDocument: { uri },
    position: { line: 9, character: 0 },
  });
  const completionLabels = new Set(completions.map(({ label }) => label));
  for (const command of ["e", "F", "Q", "R", "T", "v", "W", "z"]) {
    assert.equal(completionLabels.has(command), true, command);
  }

  const shellCompletions = await client.request("textDocument/completion", {
    textDocument: { uri },
    position: { line: 1, character: 8 },
  });
  assert.deepEqual(shellCompletions, []);

  const definitions = await client.request("textDocument/definition", {
    textDocument: { uri },
    position: { line: 5, character: 4 },
  });
  assert.deepEqual(definitions, [
    {
      uri,
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 7 },
      },
    },
  ]);

  await client.notify("textDocument/didChange", {
    textDocument: { uri, version: 2 },
    contentChanges: [{ text: validSource.replace("v4.10", "v4.11") }],
  });
  const unsupportedVersionDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, version }) => diagnosticUri === uri && version === 2,
  );
  assert.deepEqual(
    unsupportedVersionDiagnostics.diagnostics.map(({ code, range }) => ({
      code,
      range,
    })),
    [
      {
        code: "version-requires-newer-sed",
        range: {
          start: { line: 6, character: 1 },
          end: { line: 6, character: 5 },
        },
      },
    ],
  );

  await client.notify("textDocument/didChange", {
    textDocument: { uri, version: 3 },
    contentChanges: [{ text: validSource }],
  });
  const restoredDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, version }) => diagnosticUri === uri && version === 3,
  );
  assert.deepEqual(restoredDiagnostics.diagnostics, []);

  assert.equal(await client.request("shutdown"), null);
  await client.notify("exit");
  assert.deepEqual(await client.waitForExit(), {
    code: 0,
    signal: null,
  });
});

test("serves phase 9 GNU addresses through diagnostics and editor features", async (t) => {
  const client = new LspClient([]);
  t.after(() => client.dispose());

  await client.request("initialize", {
    processId: process.pid,
    rootUri: null,
    capabilities: {},
    initializationOptions: {
      dialect: "gnu",
      regexpMode: "bre",
    },
  });
  await client.notify("initialized", {});

  const uri = "file:///gnu-phase-9.sed";
  const validSource =
    ":target\n" +
    "0~2p\n" +
    "0,/stop/Ip\n" +
    "1,+2b target\n" +
    "/start/,~0T target\n" +
    "0r input.txt\n" +
    "1,+2p; \n" +
    "\n";
  await client.notify("textDocument/didOpen", {
    textDocument: {
      uri,
      languageId: "sed",
      version: 1,
      text: validSource,
    },
  });

  const validDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, version }) => diagnosticUri === uri && version === 1,
  );
  assert.deepEqual(validDiagnostics.diagnostics, []);

  const completions = await client.request("textDocument/completion", {
    textDocument: { uri },
    position: { line: 6, character: 7 },
  });
  const completionLabels = new Set(completions.map(({ label }) => label));
  for (const command of ["p", "s", "T", "z"]) {
    assert.equal(completionLabels.has(command), true, command);
  }

  const definitions = await client.request("textDocument/definition", {
    textDocument: { uri },
    position: { line: 3, character: 9 },
  });
  assert.deepEqual(definitions, [
    {
      uri,
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 7 },
      },
    },
  ]);

  const invalidSource = validSource
    .replace("0~2p", "0p")
    .replace("0,/stop/Ip", "//Ip");
  await client.notify("textDocument/didChange", {
    textDocument: { uri, version: 2 },
    contentChanges: [{ text: invalidSource }],
  });
  const invalidDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, version }) => diagnosticUri === uri && version === 2,
  );
  assert.deepEqual(
    invalidDiagnostics.diagnostics.map(({ code, range, severity }) => ({
      code,
      range,
      severity,
    })),
    [
      {
        code: "address-zero-invalid",
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 1 },
        },
        severity: DiagnosticSeverity.Error,
      },
      {
        code: "address-empty-regexp-modifiers",
        range: {
          start: { line: 2, character: 2 },
          end: { line: 2, character: 3 },
        },
        severity: DiagnosticSeverity.Error,
      },
    ],
  );

  await client.notify("textDocument/didChange", {
    textDocument: { uri, version: 3 },
    contentChanges: [{ text: validSource }],
  });
  const restoredDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, version }) => diagnosticUri === uri && version === 3,
  );
  assert.deepEqual(restoredDiagnostics.diagnostics, []);

  assert.equal(await client.request("shutdown"), null);
  await client.notify("exit");
  assert.deepEqual(await client.waitForExit(), {
    code: 0,
    signal: null,
  });
});

test("serves phase 10 GNU substitution and regexp syntax through LSP", async (t) => {
  const client = new LspClient([]);
  t.after(() => client.dispose());

  await client.request("initialize", {
    processId: process.pid,
    rootUri: null,
    capabilities: {},
    initializationOptions: {
      dialect: "gnu",
      regexpMode: "bre",
    },
  });
  await client.notify("initialized", {});

  const uri = "file:///gnu-phase-10.sed";
  const validSource =
    ":target\n" +
    "s/\\(foo\\)/\\U&\\E/2gI\n" +
    "s/start\\\n" +
    "stop/end/eMp\n" +
    "/begin\\\n" +
    "end/b target\n" +
    "s/a/b/ e I m \n" +
    "s/a/b/w :fake;L#}\n" +
    "/x\\\n" +
    "y/p; \n" +
    "\n";
  await client.notify("textDocument/didOpen", {
    textDocument: {
      uri,
      languageId: "sed",
      version: 1,
      text: validSource,
    },
  });

  const validDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, version }) => diagnosticUri === uri && version === 1,
  );
  assert.deepEqual(validDiagnostics.diagnostics, []);

  const flagCompletions = await client.request("textDocument/completion", {
    textDocument: { uri },
    position: { line: 6, character: 14 },
  });
  const flagLabels = new Set(flagCompletions.map(({ label }) => label));
  for (const flag of ["e", "I", "M", "m"]) {
    assert.equal(flagLabels.has(flag), true, flag);
  }

  const commandCompletions = await client.request("textDocument/completion", {
    textDocument: { uri },
    position: { line: 9, character: 4 },
  });
  const commandLabels = new Set(commandCompletions.map(({ label }) => label));
  for (const command of ["p", "s", "T", "z"]) {
    assert.equal(commandLabels.has(command), true, command);
  }

  const definitions = await client.request("textDocument/definition", {
    textDocument: { uri },
    position: { line: 5, character: 9 },
  });
  assert.deepEqual(definitions, [
    {
      uri,
      range: {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 7 },
      },
    },
  ]);

  const invalidSource = validSource
    .replace("s/\\(foo\\)/\\U&\\E/2gI", "s//x/I")
    .replace("/begin\\\nend/b target", "/\\1\\\nend/b target")
    .replace("s/a/b/ e I m ", "s/a/b/2 g 3");
  await client.notify("textDocument/didChange", {
    textDocument: { uri, version: 2 },
    contentChanges: [{ text: invalidSource }],
  });
  const invalidDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, version }) => diagnosticUri === uri && version === 2,
  );
  assert.deepEqual(
    invalidDiagnostics.diagnostics.map(({ code, range, severity }) => ({
      code,
      range,
      severity,
    })),
    [
      {
        code: "substitute-empty-regexp-modifiers",
        range: {
          start: { line: 1, character: 5 },
          end: { line: 1, character: 6 },
        },
        severity: DiagnosticSeverity.Error,
      },
      {
        code: "bre-invalid-back-reference",
        range: {
          start: { line: 4, character: 1 },
          end: { line: 4, character: 3 },
        },
        severity: DiagnosticSeverity.Error,
      },
      {
        code: "substitute-occurrence-repeated",
        range: {
          start: { line: 6, character: 10 },
          end: { line: 6, character: 11 },
        },
        severity: DiagnosticSeverity.Error,
      },
    ],
  );

  await client.notify("textDocument/didChange", {
    textDocument: { uri, version: 3 },
    contentChanges: [{ text: validSource }],
  });
  const restoredDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, version }) => diagnosticUri === uri && version === 3,
  );
  assert.deepEqual(restoredDiagnostics.diagnostics, []);

  assert.equal(await client.request("shutdown"), null);
  await client.notify("exit");
  assert.deepEqual(await client.waitForExit(), {
    code: 0,
    signal: null,
  });
});

test("rejects invalid initialization syntax options with InvalidParams", async (t) => {
  const client = new LspClient([]);
  t.after(() => client.dispose());

  await assert.rejects(
    client.request("initialize", {
      processId: process.pid,
      rootUri: null,
      capabilities: {},
      initializationOptions: {
        dialect: "bsd",
        regexpMode: "bre",
      },
    }),
    (error) => {
      assert.equal(error.code, ErrorCodes.InvalidParams);
      assert.match(error.message, /dialect/);
      return true;
    },
  );
});

test("uses POSIX BRE defaults for null initialization and configuration options", async (t) => {
  const client = new LspClient([]);
  t.after(() => client.dispose());

  const initializeResult = await client.request("initialize", {
    processId: process.pid,
    rootUri: null,
    capabilities: {},
    initializationOptions: null,
  });
  assert.deepEqual(initializeResult.capabilities, {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    completionProvider: {},
    definitionProvider: true,
  });
  await client.notify("initialized", {});

  const uri = "file:///null-profile-options.sed";
  await client.notify("textDocument/didOpen", {
    textDocument: {
      uri,
      languageId: "sed",
      version: 1,
      text: "z\n",
    },
  });
  const initialDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri }) => diagnosticUri === uri,
  );
  assert.deepEqual(initialDiagnostics, {
    uri,
    version: 1,
    diagnostics: [
      {
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
        message: "Unknown POSIX sed command: `z`.",
        code: "command-unknown",
        source: "sed-language-server",
      },
    ],
  });

  const gnuDiagnostics = client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, diagnostics }) =>
      diagnosticUri === uri && diagnostics.length === 0,
  );
  await client.notify("workspace/didChangeConfiguration", {
    settings: {
      sedLanguageServer: {
        dialect: "gnu",
        regexpMode: "bre",
      },
    },
  });
  assert.deepEqual(await gnuDiagnostics, {
    uri,
    version: 1,
    diagnostics: [],
  });

  const resetDiagnostics = client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri: diagnosticUri, diagnostics }) =>
      diagnosticUri === uri && diagnostics[0]?.code === "command-unknown",
  );
  await client.notify("workspace/didChangeConfiguration", {
    settings: null,
  });
  assert.deepEqual(await resetDiagnostics, {
    uri,
    version: 1,
    diagnostics: [
      {
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
        message: "Unknown POSIX sed command: `z`.",
        code: "command-unknown",
        source: "sed-language-server",
      },
    ],
  });

  assert.equal(await client.request("shutdown"), null);
  await client.notify("exit");
  assert.deepEqual(await client.waitForExit(), {
    code: 0,
    signal: null,
  });
});

test("reconfigures every open document and retains the last valid syntax profile", async (t) => {
  const client = new LspClient([]);
  t.after(() => client.dispose());

  await client.request("initialize", {
    processId: process.pid,
    rootUri: null,
    capabilities: {},
    initializationOptions: {
      dialect: "posix",
      regexpMode: "bre",
    },
  });
  await client.notify("initialized", {});

  const firstUri = "file:///first-profile-change.sed";
  const secondUri = "file:///second-profile-change.sed";
  await client.notify("textDocument/didOpen", {
    textDocument: {
      uri: firstUri,
      languageId: "sed",
      version: 7,
      text: "z\n",
    },
  });
  await client.notify("textDocument/didOpen", {
    textDocument: {
      uri: secondUri,
      languageId: "sed",
      version: 11,
      text: "z\n",
    },
  });

  const firstPosixDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri }) => uri === firstUri,
  );
  const secondPosixDiagnostics = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri }) => uri === secondUri,
  );
  assert.equal(firstPosixDiagnostics.diagnostics[0]?.code, "command-unknown");
  assert.equal(secondPosixDiagnostics.diagnostics[0]?.code, "command-unknown");

  const posixCompletions = await client.request("textDocument/completion", {
    textDocument: { uri: firstUri },
    position: { line: 1, character: 0 },
  });
  assert.equal(
    posixCompletions.some(({ label }) => label === "z"),
    false,
    "POSIX command completion should not include z",
  );

  const firstGnuDiagnostics = client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri, version, diagnostics }) =>
      uri === firstUri && version === 7 && diagnostics.length === 0,
  );
  const secondGnuDiagnostics = client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri, version, diagnostics }) =>
      uri === secondUri && version === 11 && diagnostics.length === 0,
  );
  await client.notify("workspace/didChangeConfiguration", {
    settings: {
      sedLanguageServer: {
        dialect: "gnu",
        regexpMode: "bre",
      },
    },
  });

  assert.deepEqual(await firstGnuDiagnostics, {
    uri: firstUri,
    version: 7,
    diagnostics: [],
  });
  assert.deepEqual(await secondGnuDiagnostics, {
    uri: secondUri,
    version: 11,
    diagnostics: [],
  });

  const gnuCompletions = await client.request("textDocument/completion", {
    textDocument: { uri: firstUri },
    position: { line: 1, character: 0 },
  });
  assert.equal(
    gnuCompletions.some(({ label }) => label === "z"),
    true,
    "GNU command completion should include z",
  );

  const configurationError = client.waitForNotification(
    "window/showMessage",
    ({ type }) => type === MessageType.Error,
  );
  await client.notify("workspace/didChangeConfiguration", {
    settings: {
      sedLanguageServer: {
        dialect: "bsd",
        regexpMode: "bre",
      },
    },
  });

  const errorMessage = await configurationError;
  assert.equal(errorMessage.type, MessageType.Error);
  assert.match(errorMessage.message, /dialect/);

  await client.notify("textDocument/didChange", {
    textDocument: { uri: firstUri, version: 8 },
    contentChanges: [{ text: "z\n" }],
  });
  const diagnosticsAfterInvalidConfiguration = await client.waitForNotification(
    "textDocument/publishDiagnostics",
    ({ uri, version }) => uri === firstUri && version === 8,
  );
  assert.deepEqual(diagnosticsAfterInvalidConfiguration, {
    uri: firstUri,
    version: 8,
    diagnostics: [],
  });

  const completionsAfterInvalidConfiguration = await client.request(
    "textDocument/completion",
    {
      textDocument: { uri: firstUri },
      position: { line: 1, character: 0 },
    },
  );
  assert.equal(
    completionsAfterInvalidConfiguration.some(({ label }) => label === "z"),
    true,
    "an invalid change should retain the GNU syntax profile",
  );

  assert.equal(await client.request("shutdown"), null);
  await client.notify("exit");
  assert.deepEqual(await client.waitForExit(), {
    code: 0,
    signal: null,
  });
});
