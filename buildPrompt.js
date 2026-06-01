const fs = require("fs");
const path = require("path");

const TXT_DIR = path.join(__dirname, "txt");
const PROMPTS_DIR = path.join(__dirname, "prompts");
const CONTEXT_FILE = path.join(__dirname, "contexts", "reZero.json");

function buildPrompt(context, chapterTxt) {
  const { baseSystemPrompt, characters, glossary, styleGuide } = context;

  const charList = characters
    .map(
      (c) =>
        `- ${c.name}${c.vietnameseName !== c.name ? ` (${c.vietnameseName})` : ""}: ${c.speechStyle}`
    )
    .join("\n");

  const glossaryList = glossary
    .map((g) => `- ${g.original} → ${g.translation}`)
    .join("\n");

  const system = `${baseSystemPrompt}

---
## NHÂN VẬT & GIỌNG NÓI
${charList}

---
## BẢNG THUẬT NGỮ
${glossaryList}`;

  const user = `Dịch toàn bộ đoạn văn sau sang tiếng Việt. KHÔNG ngắt quảng, KHÔNG tóm tắt, KHÔNG bỏ sót bất kỳ câu nào. Output đầy đủ toàn bộ nội dung đã dịch.

${chapterTxt}`;

  return { system, user };
}

function main() {
  if (!fs.existsSync(PROMPTS_DIR)) fs.mkdirSync(PROMPTS_DIR);

  const context = JSON.parse(fs.readFileSync(CONTEXT_FILE, "utf8"));

  const files = fs
    .readdirSync(TXT_DIR)
    .filter((f) => f.endsWith(".txt"))
    .sort();

  for (const file of files) {
    const chapterTxt = fs.readFileSync(path.join(TXT_DIR, file), "utf8");
    const { system, user } = buildPrompt(context, chapterTxt);

    const promptTxt = `=== SYSTEM ===\n${system}\n\n=== USER ===\n${user}`;
    const outName = file;
    fs.writeFileSync(path.join(PROMPTS_DIR, outName), promptTxt, "utf8");
    console.log(`✓ ${outName}`);
  }

  console.log(`\nDone. ${files.length} prompts saved to prompts/`);
}

main();
