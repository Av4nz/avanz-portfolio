/**
 * Verifies package-lock.json under both npm 10 (what GitHub Actions ships with
 * Node 22) and npm 11 (local), for the host platform and for linux/x64.
 *
 *   npm run verify:lock
 *
 * Runs against a clone of the committed files, not the working tree, because
 * that is what CI actually installs.
 */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// A pinned npm 10, cached between runs.
const sandbox = join(tmpdir(), "npm10-tool");
if (!existsSync(join(sandbox, "node_modules", "npm"))) {
  rmSync(sandbox, { recursive: true, force: true });
  mkdirSync(sandbox, { recursive: true });
  console.log("installing npm@10 into a sandbox (one time)...");
  execSync("npm init -y", { cwd: sandbox, stdio: "pipe" });
  execSync("npm install npm@10 --no-audit --no-fund", { cwd: sandbox, stdio: "pipe" });
}
const npm10 = join(sandbox, "node_modules", "npm", "bin", "npm-cli.js");

const proj = join(tmpdir(), "lock-verify");
rmSync(proj, { recursive: true, force: true });
mkdirSync(proj, { recursive: true });
copyFileSync(join(root, "package.json"), join(proj, "package.json"));
copyFileSync(join(root, "package-lock.json"), join(proj, "package-lock.json"));

console.log(`local npm  : ${execSync("npm -v", { encoding: "utf8" }).trim()}`);
console.log(`sandbox npm: ${execSync(`node "${npm10}" -v`, { encoding: "utf8" }).trim()}\n`);

let failures = 0;
for (const [label, bin] of [
  ["npm 10 (CI)", `node "${npm10}"`],
  ["npm 11 (local)", "npm"],
]) {
  for (const [platform, flags] of [
    ["host", ""],
    ["linux/x64", "--os=linux --cpu=x64"],
  ]) {
    const what = `${label} on ${platform}`;
    try {
      execSync(`${bin} ci --dry-run --no-audit --no-fund ${flags}`, {
        cwd: proj,
        stdio: "pipe",
      });
      console.log(`  ok    ${what}`);
    } catch (e) {
      failures++;
      const out = String(e.stdout ?? "") + String(e.stderr ?? "");
      console.log(`  FAIL  ${what}`);
      out
        .split("\n")
        .filter((l) => l.includes("Missing:") || l.includes("Invalid:"))
        .slice(0, 6)
        .forEach((l) => console.log(`        ${l.trim()}`));
    }
  }
}

rmSync(proj, { recursive: true, force: true });
console.log(
  failures === 0
    ? "\nLockfile installs cleanly under every combination.\n"
    : `\n${failures} combination(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
