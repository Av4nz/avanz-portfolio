/**
 * Adds the top-level @emnapi entries that npm 11 omits from package-lock.json.
 *
 *   npm run fix:lock
 *
 * Why this exists:
 *   sharp's `@img/sharp-wasm32` and tailwind's `@tailwindcss/oxide-wasm32-wasi`
 *   declare runtime dependencies on @emnapi/core and @emnapi/runtime. npm 11
 *   resolves those to nested copies and writes no hoisted entry. npm 10, which
 *   GitHub Actions ships with Node 22, requires the hoisted entry and refuses
 *   `npm ci` with "Missing: @emnapi/runtime from lock file".
 *
 * Why not simply regenerate with npm 10:
 *   it also moves ~18 unrelated transitive packages, including a chokidar major
 *   downgrade. This script adds only the missing entries, so every other
 *   resolved version stays exactly as npm 11 chose.
 *
 * Version choice:
 *   the highest stable release satisfying every declared range. Pre-release
 *   versions are excluded, because npm never resolves a caret range to a
 *   pre-release and picking one would silently change behaviour.
 *
 * Safe to re-run: it is a no-op once the entries are present.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = join(root, "package-lock.json");
const lock = JSON.parse(readFileSync(lockPath, "utf8"));

const parse = (v) => v.split(".").map(Number);
const cmp = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};
const isStable = (v) => /^\d+\.\d+\.\d+$/.test(v);

/** Minimum version a range demands, e.g. "^1.11.3" -> "1.11.3". */
const floorOf = (range) => range.replace(/^[\^~>=<\s]+/, "").trim();

/** Every range any package declares for this dependency. */
const rangesFor = (name) => {
  const out = [];
  for (const entry of Object.values(lock.packages)) {
    for (const block of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      const r = entry[block]?.[name];
      if (r) out.push(r);
    }
  }
  return out;
};

let added = 0;

const addEntry = (key, name, version, nestedSource) => {
  const meta = JSON.parse(
    execSync(`npm view "${name}@${version}" dist.tarball dist.integrity license engines --json`, {
      encoding: "utf8",
      cwd: root,
    }),
  );
  lock.packages[key] = {
    version,
    resolved: meta["dist.tarball"],
    integrity: meta["dist.integrity"],
    ...(meta.license ? { license: meta.license } : {}),
    optional: true,
    ...(nestedSource?.dependencies ? { dependencies: nestedSource.dependencies } : {}),
    ...(meta.engines ? { engines: meta.engines } : {}),
  };
};

/** An existing copy npm 11 wrote elsewhere in the tree, used to mirror shape. */
const nestedCopy = (name) =>
  Object.entries(lock.packages).find(([k]) => k.endsWith(`/node_modules/${name}`))?.[1];

for (const name of ["@emnapi/core", "@emnapi/runtime"]) {
  const key = `node_modules/${name}`;
  if (lock.packages[key]) {
    console.log(`  ok      ${name} already hoisted`);
    continue;
  }

  const ranges = rangesFor(name);
  if (ranges.length === 0) {
    console.log(`  skip    ${name} is not required by anything`);
    continue;
  }

  // The hoisted copy must satisfy the strictest floor across all dependents.
  const floor = ranges.map(floorOf).sort(cmp).at(-1);

  const all = JSON.parse(
    execSync(`npm view "${name}" versions --json`, { encoding: "utf8", cwd: root }),
  );
  const version = all
    .filter(isStable)
    .filter((v) => parse(v)[0] === parse(floor)[0]) // stay on the same major
    .filter((v) => cmp(v, floor) >= 0)
    .sort(cmp)
    .at(-1);

  if (!version) {
    console.error(`  ERROR   no stable ${name} satisfies >= ${floor}`);
    process.exit(1);
  }

  addEntry(key, name, version, nestedCopy(name));
  console.log(`  added   ${name}@${version}  (ranges: ${[...new Set(ranges)].join(", ")})`);
  added++;
}

/**
 * Second pass: the entries just added carry their own exact pins. @emnapi/core
 * pins @emnapi/wasi-threads to a specific version, and the copy already hoisted
 * is a different patch, so npm needs a nested entry beside core rather than
 * resolving to the hoisted one.
 */
for (const parentName of ["@emnapi/core", "@emnapi/runtime"]) {
  const parentKey = `node_modules/${parentName}`;
  const parent = lock.packages[parentKey];
  if (!parent?.dependencies) continue;

  for (const [dep, range] of Object.entries(parent.dependencies)) {
    if (!dep.startsWith("@emnapi/")) continue;

    const hoisted = lock.packages[`node_modules/${dep}`];
    const exact = /^\d+\.\d+\.\d+$/.test(range);
    const satisfied = hoisted && (exact ? hoisted.version === range : cmp(hoisted.version, floorOf(range)) >= 0);
    if (satisfied) {
      console.log(`  ok      ${dep}@${hoisted.version} satisfies ${parentName}'s ${range}`);
      continue;
    }

    const nestedKey = `${parentKey}/node_modules/${dep}`;
    if (lock.packages[nestedKey]) continue;

    const version = exact ? range : floorOf(range);
    addEntry(nestedKey, dep, version, nestedCopy(dep));
    console.log(`  nested  ${dep}@${version} under ${parentName} (pinned ${range})`);
    added++;
  }
}

if (added > 0) {
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
  console.log(`\nwrote package-lock.json (${added} entries added)`);
} else {
  console.log("\nlockfile already complete, nothing to do");
}
