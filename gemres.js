const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

require("dotenv").config();
const API_KEY = process.env.GEMINI_API_KEY;
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemma-4-31b-it";

const PROMPTS_DIR = path.join(__dirname, "prompts");
const GPTRES_DIR = path.join(__dirname, "gptres");

function getPending() {
  const done = new Set(
    fs.existsSync(GPTRES_DIR) ? fs.readdirSync(GPTRES_DIR) : []
  );
  return fs
    .readdirSync(PROMPTS_DIR)
    .filter((f) => f.endsWith(".txt") && !done.has(f))
    .sort();
}

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); })
  );
}

function parsePrompt(raw) {
  const sysMatch = raw.match(/=== SYSTEM ===\s*([\s\S]*?)(?==== USER ===|$)/);
  const userMatch = raw.match(/=== USER ===\s*([\s\S]*?)$/);
  return {
    system: sysMatch ? sysMatch[1].trim() : null,
    user: userMatch ? userMatch[1].trim() : raw.trim(),
  };
}

// Stream response, write chunks directly to file to avoid RAM buildup
async function streamToFile(rawPrompt, outPath) {
  const { system, user } = parsePrompt(rawPrompt);
  const url = `${BASE_URL}/${MODEL}:streamGenerateContent?alt=sse&key=${API_KEY}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: user }] }],
    ...(system && { systemInstruction: { parts: [{ text: system }] } }),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }

  const ws = fs.createWriteStream(outPath, { encoding: "utf-8" });
  let totalChars = 0;
  let buf = "";

  await new Promise((resolve, reject) => {
    res.body.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") continue;
        try {
          const json = JSON.parse(raw);
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            ws.write(text);
            totalChars += text.length;
            process.stdout.write(`\r  streaming... ${totalChars} chars`);
          }
        } catch (_) {}
      }
    });

    res.body.on("end", () => {
      ws.end();
      resolve();
    });

    res.body.on("error", (err) => {
      ws.destroy();
      reject(err);
    });
  });

  console.log();
  if (totalChars === 0) throw new Error("Empty response");
}

async function processChapter(file) {
  const prompt = fs.readFileSync(path.join(PROMPTS_DIR, file), "utf-8");
  const chapter = file.replace(".txt", "");
  console.log(`\n→ ${chapter}`);

  if (!fs.existsSync(GPTRES_DIR)) fs.mkdirSync(GPTRES_DIR);
  const outPath = path.join(GPTRES_DIR, file);

  await streamToFile(prompt, outPath);
  console.log(`  ✓ Lưu → gptres/${file}`);
  return true;
}

async function main() {
  const pending = getPending();

  if (pending.length === 0) {
    console.log("Tất cả chapters đã có trong gptres/. Không có gì để làm.");
    return;
  }

  console.log(`\nPending (${pending.length} chapters):`);
  pending.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));

  // Mảng index muốn ưu tiên — sửa tại đây, để [] để dùng input
  const PRESET = [10,11,12,13,14,15,16,17,18]; 

  let toProcess = [];
  // Tìm file theo chapter number (vd: 24 → chapter_024.txt)
  const chapterFile = (n) => {
    const name = `chapter_${String(n).padStart(3, "0")}.txt`;
    return fs.existsSync(path.join(PROMPTS_DIR, name)) ? name : null;
  };

  if (PRESET.length > 0) {
    toProcess = PRESET.map(chapterFile).filter(Boolean);
    console.log(`\nDùng preset: ${toProcess.join(", ")}`);
  } else {
    const ans = await ask(
      `\nNhập chapter (vd: 1,3,5), range (vd: 2-5) hoặc "all": `
    );

    if (ans.toLowerCase() === "all") {
      toProcess = pending;
    } else {
      const nums = new Set();
      for (const part of ans.split(",").map((s) => s.trim())) {
        const range = part.match(/^(\d+)-(\d+)$/);
        if (range) {
          for (let i = +range[1]; i <= +range[2]; i++) nums.add(i);
        } else {
          const n = parseInt(part);
          if (!isNaN(n)) nums.add(n);
        }
      }
      toProcess = [...nums]
        .sort((a, b) => a - b)
        .map(chapterFile)
        .filter(Boolean);

      if (toProcess.length === 0) {
        console.log("Không có chapter hợp lệ.");
        process.exit(1);
      }
    }
  }

  let ok = 0;
  for (let i = 0; i < toProcess.length; i++) {
    try {
      await processChapter(toProcess[i]);
      ok++;
    } catch (err) {
      console.log(`  ✗ ${toProcess[i]} — ${err.message}`);
    }
    if (i < toProcess.length - 1) {
      console.log(`  Chờ 90s trước chapter tiếp theo...`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  console.log(`\nHoàn tất. ${ok}/${toProcess.length} chapter(s) thành công.`);
}

main().catch(console.error);
