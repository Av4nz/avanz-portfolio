/**
 * Runs every check in one command.
 *
 *   npm test
 *
 * Handles the preview server automatically: reuses one if it is already
 * running, otherwise starts and stops its own. That removes the two-terminal
 * dance that `verify` and `audit` would otherwise require.
 *
 * Server shutdown note: on Windows, `spawn(..., { shell: true })` puts a cmd.exe
 * between us and node, so child.kill() terminates the shell and orphans the
 * server, which then holds the port and keeps the process alive forever.
 * Shutting down by listening port instead is reliable regardless of how many
 * processes are in the chain.
 */
import { spawn, execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 4321);
const BASE = `http://localhost:${PORT}`;

const isUp = async () => {
  try {
    const res = await fetch(BASE + "/", { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
};

/** Terminate whatever is listening on PORT, whichever process it turns out to be. */
const killPort = () => {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("netstat", ["-aon"], { encoding: "utf8" });
      const pids = new Set();
      for (const line of out.split("\n")) {
        if (line.includes(`:${PORT}`) && line.includes("LISTENING")) {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && pid !== "0") pids.add(pid);
        }
      }
      for (const pid of pids) {
        try {
          execFileSync("taskkill", ["/F", "/T", "/PID", pid], { stdio: "ignore" });
        } catch {}
      }
    } else {
      execFileSync("sh", ["-c", `lsof -ti tcp:${PORT} | xargs -r kill -9`], { stdio: "ignore" });
    }
  } catch {}
};

const run = (label, cmd, args) => {
  console.log(`\n${"=".repeat(60)}\n${label}\n${"=".repeat(60)}`);
  try {
    execFileSync(cmd, args, { cwd: root, stdio: "inherit", shell: true });
    return true;
  } catch {
    return false;
  }
};

const results = [];
let startedServer = false;

try {
  // 1. Build first: everything downstream reads dist/.
  results.push(["build", run("BUILD (type-check + compile)", "npx", ["astro", "build"])]);

  // 2. Content-path tests manage their own builds, so run before the server.
  results.push([
    "content paths",
    run("CONTENT PATHS (cover images, published state, schema)", "node", [
      "scripts/test-content-paths.mjs",
    ]),
  ]);

  // 3. Structural checks need dist/ but not a server.
  results.push([
    "verify",
    run("VERIFY (structure, links, budgets)", "node", ["scripts/verify-build.mjs"]),
  ]);

  // 4. Runtime checks need a server. Reuse an existing one when possible.
  if (await isUp()) {
    console.log(`\nReusing the preview server already on ${BASE}`);
  } else {
    console.log(`\nStarting preview server on ${BASE} ...`);
    spawn("npx", ["astro", "preview", "--port", String(PORT)], {
      cwd: root,
      stdio: "ignore",
      shell: true,
    });
    startedServer = true;

    let ready = false;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      if (await isUp()) {
        ready = true;
        break;
      }
    }
    if (!ready) console.error("Preview server did not start; skipping runtime checks.");
  }

  if (await isUp()) {
    results.push([
      "audit",
      run("AUDIT (a11y, contrast, overflow, behaviour)", "node", ["scripts/audit.mjs"]),
    ]);
  } else {
    results.push(["audit", false]);
  }
} finally {
  if (startedServer) {
    console.log("\nStopping the preview server ...");
    killPort();
  }
}

console.log(`\n${"=".repeat(60)}\nSUMMARY\n${"=".repeat(60)}`);
for (const [name, ok] of results) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
}

const failed = results.filter(([, ok]) => !ok);
console.log(
  failed.length === 0
    ? "\nEverything passed.\n"
    : `\n${failed.length} suite(s) failed: ${failed.map(([n]) => n).join(", ")}\n`,
);

// Force exit: a stray handle from a spawned process must not hang the run.
process.exit(failed.length === 0 ? 0 : 1);
