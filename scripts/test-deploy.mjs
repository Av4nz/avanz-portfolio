/**
 * Simulates what a deploy host does: clone the repository, install strictly
 * from the lockfile, build, and verify.
 *
 *   npm run test:deploy
 *
 * This catches the class of bug that never shows up locally, where the build
 * only works because of a file that was never committed or a package that
 * happened to be installed as someone else's transitive dependency. Vercel and
 * Cloudflare Pages see only what git tracks.
 *
 * Slower than the other suites (a full npm ci), so it is not part of
 * `npm test`. Run it before the first deploy and after dependency changes.
 */
import { execSync } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = join(tmpdir(), "avanz-deploy-sim");

let failures = 0;
const check = (label, ok, detail = "") => {
  if (ok) console.log(`  ok    ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ""}`);
  }
};

const run = (cmd, cwd, label) => {
  try {
    execSync(cmd, { cwd, stdio: "pipe" });
    return true;
  } catch (err) {
    console.log(`  FAIL  ${label}`);
    const out = String(err.stdout ?? "") + String(err.stderr ?? "");
    console.log(out.split("\n").slice(-15).join("\n"));
    failures++;
    return false;
  }
};

rmSync(tmp, { recursive: true, force: true });

try {
  console.log("\nCloning tracked files only");
  execSync(`git clone -q . "${tmp}"`, { cwd: root, stdio: "pipe" });

  const tracked = execSync(`git -C "${tmp}" ls-files`, { encoding: "utf8" })
    .trim()
    .split("\n");
  console.log(`  ${tracked.length} tracked files`);

  // Generated assets must be committed: the deploy host runs `npm run build`,
  // not the generator scripts, so anything missing here 404s in production.
  for (const required of [
    "package.json",
    "package-lock.json",
    "public/og.png",
    "public/favicon.ico",
    "public/favicon.svg",
    "public/apple-touch-icon.png",
    "src/pages/robots.txt.ts",
    "src/data/site.ts",
  ]) {
    check(`tracked: ${required}`, tracked.includes(required));
  }

  console.log("\nInstalling from the lockfile (npm ci)");
  const installed = run("npm ci --no-audit --no-fund", tmp, "npm ci");
  check("clean install succeeds", installed);

  if (installed) {
    console.log("\nBuilding as the host would");
    const built = run("npm run build", tmp, "npm run build");
    check("build succeeds on a fresh clone", built);

    if (built) {
      console.log("\nExpected output exists");
      for (const f of [
        "dist/index.html",
        "dist/404.html",
        "dist/robots.txt",
        "dist/sitemap-index.xml",
        "dist/og.png",
        "dist/favicon.ico",
        "dist/apple-touch-icon.png",
        "dist/work/placeholder-one-dashboard/index.html",
      ]) {
        check(f, existsSync(join(tmp, f)));
      }

      console.log("\nStructural checks pass in the clone");
      check("verify", run("npm run verify", tmp, "npm run verify"));
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(
  failures === 0
    ? "\nFresh-clone deploy simulation passed.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
