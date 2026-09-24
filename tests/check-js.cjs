const { execFileSync } = require("node:child_process");
const { readdirSync, statSync } = require("node:fs");
const { join, extname } = require("node:path");
const root = join(__dirname, "..", "extension");
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const file = join(dir, name);
    return statSync(file).isDirectory() ? walk(file) : extname(file) === ".js" ? [file] : [];
  });
}
for (const file of walk(root)) execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
console.log("All extension JavaScript parses successfully.");
