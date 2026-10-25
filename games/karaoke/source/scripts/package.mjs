// Builds the app and bundles everything needed to drop Karaoke into another Node server.
// Output: release/karaoke.zip  →  karaoke/ (drop-in), INTEGRATION.md, source/
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const out = join(root, "release");
// Staged outside the project (cpSync refuses to copy a folder into itself).
const tmp = mkdtempSync(join(tmpdir(), "karaoke-"));
const stage = join(tmp, "karaoke");
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: "inherit" });

run("npx vite build");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(stage, "karaoke", "server"), { recursive: true });

// 1. Drop-in folder: server module + prebuilt app. No npm dependencies needed on the host.
copyFileSync(join(root, "server", "karaoke.mjs"), join(stage, "karaoke", "server", "karaoke.mjs"));
copyFileSync(join(root, "server", "queue.mjs"), join(stage, "karaoke", "server", "queue.mjs"));
cpSync(join(root, "dist"), join(stage, "karaoke", "app"), { recursive: true });

// 2. Instructions.
copyFileSync(join(root, "INTEGRATION.md"), join(stage, "INTEGRATION.md"));

// 3. Full source, for future changes.
const skip = new Set(["node_modules", "dist", "release", ".git", ".claude", ".DS_Store", ".env.local"]);
cpSync(root, join(stage, "source"), {
  recursive: true,
  filter: (src) => {
    const rel = src.slice(root.length + 1);
    return !rel.split("/").some((part) => skip.has(part)) && !rel.includes("scripts/.cache");
  },
});

mkdirSync(out, { recursive: true });
run(`zip -rqX "${join(out, "karaoke.zip")}" karaoke`, tmp);
rmSync(tmp, { recursive: true, force: true });
console.log(`\n✓ ${join(out, "karaoke.zip")}`);
if (!existsSync(join(out, "karaoke.zip"))) process.exit(1);
