const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const packageJson = {
  name: "witchculttranslation",
  version: "1.0.0",
  dependencies: {
    cheerio: "^1.0.0",
    dotenv: "^16.0.0",
    express: "^4.18.0",
    "node-fetch": "^2.7.0",
    "puppeteer-extra": "^3.3.6",
    "puppeteer-extra-plugin-stealth": "^2.11.2",
    qrcode: "^1.5.4",
  },
};

const pkgPath = path.join(__dirname, "package.json");
if (!fs.existsSync(pkgPath)) {
  fs.writeFileSync(pkgPath, JSON.stringify(packageJson, null, 2));
  console.log("✓ created package.json");
} else {
  console.log("- package.json already exists");
}

console.log("Installing dependencies...");
execSync("npm install", { cwd: __dirname, stdio: "inherit" });
console.log("✓ dependencies installed");

const dirs = ["output", "txt", "txtVN", "prompts", "contexts"];

for (const dir of dirs) {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p);
    console.log(`✓ created ${dir}/`);
  } else {
    console.log(`- ${dir}/ already exists`);
  }
}

console.log("\nReady. Run:");
console.log("  node app.js        — scrape all chapters");
console.log("  node toTxt.js      — convert output HTML → txt/");
console.log("  node buildPrompt.js — build translation prompts → prompts/");
