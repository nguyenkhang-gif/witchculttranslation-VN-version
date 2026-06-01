const fs = require("fs");
const path = require("path");

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
