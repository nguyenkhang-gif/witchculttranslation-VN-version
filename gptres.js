const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

puppeteer.use(StealthPlugin());

const PROMPTS_DIR = path.join(__dirname, "prompts");
const GPTRES_DIR = path.join(__dirname, "gptres");

// Nếu có index ở đây, script sẽ chạy thẳng các chapter này mà không hỏi
const PRESET = [18, 19, 20, 21, 22, 23, 32, 34, 35, 36, 39, 40, 50];

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

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const randDelay = (min, max) =>
  delay(min + Math.floor(Math.random() * (max - min)));

async function waitStableResponse(page, timeoutMs = 240000) {
  const start = Date.now();
  let prev = "";
  let stableMs = 0;
  const STABLE = 4000;
  const POLL = 1500;

  while (Date.now() - start < timeoutMs) {
    await delay(POLL);
    const cur = await page.evaluate(() => {
      const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
      const last = msgs[msgs.length - 1];
      return last ? last.innerText.trim() : "";
    });
    if (cur && cur === prev) {
      stableMs += POLL;
      if (stableMs >= STABLE) return cur;
    } else {
      stableMs = 0;
      prev = cur;
    }
  }
  return prev;
}

async function processChapter(page, file) {
  const msg = fs.readFileSync(path.join(PROMPTS_DIR, file), "utf-8").trim();
  const chapter = file.replace(".txt", "");
  console.log(`\n→ ${chapter}`);

  await page.goto("https://chatgpt.com", { waitUntil: "networkidle2" });
  await page.waitForSelector("#prompt-textarea", { timeout: 20000 });
  await randDelay(800, 1500);

  await page.evaluate((text) => {
    const el = document.querySelector("#prompt-textarea");
    el.focus();
    document.execCommand("insertText", false, text);
  }, msg);

  await randDelay(500, 1000);
  await page.keyboard.press("Enter");
  console.log("  Đã gửi, đang đợi response...");

  const response = await waitStableResponse(page);

  if (response) {
    if (!fs.existsSync(GPTRES_DIR)) fs.mkdirSync(GPTRES_DIR);
    fs.writeFileSync(path.join(GPTRES_DIR, file), response, "utf-8");
    console.log(`  ✓ Lưu → gptres/${file}`);
    return true;
  }

  console.log(`  ✗ Không lấy được response.`);
  return false;
}

async function main() {
  const pending = getPending();

  if (pending.length === 0) {
    console.log("Tất cả chapters đã có trong gptres/. Không có gì để làm.");
    return;
  }

  let toProcess = [];

  if (PRESET.length > 0) {
    // Chạy thẳng theo PRESET, bỏ qua chapter đã có
    toProcess = PRESET
      .map((n) => `chapter_${String(n).padStart(3, "0")}.txt`)
      .filter((f) => pending.includes(f));
    if (toProcess.length === 0) {
      console.log("Tất cả chapters trong PRESET đã có trong gptres/.");
      return;
    }
    console.log(`\nChạy theo PRESET (${toProcess.length} chapters):`);
    toProcess.forEach((f) => console.log(`  • ${f}`));
  } else {
    console.log(`\nPending (${pending.length} chapters):`);
    pending.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));

    const ans = await ask(
      `\nNhập index (1-${pending.length}) hoặc "all" để chạy tất cả: `
    );

    if (ans.toLowerCase() === "all") {
      toProcess = pending;
    } else {
      const n = parseInt(ans);
      if (isNaN(n) || n < 1 || n > pending.length) {
        console.log("Index không hợp lệ.");
        process.exit(1);
      }
      toProcess = [pending[n - 1]];
    }
  }

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ["--no-sandbox"],
  });

  const page = await browser.newPage();
  await page.goto("https://chatgpt.com", { waitUntil: "networkidle2" });

  // Accept cookie popup nếu có
  try {
    await page.waitForFunction(
      () => {
        const btn = [...document.querySelectorAll("button")].find((b) =>
          /accept|agree|got it|ok/i.test(b.innerText)
        );
        if (btn) { btn.click(); return true; }
        return false;
      },
      { timeout: 5000 }
    );
  } catch (_) {}

  for (const file of toProcess) {
    await processChapter(page, file);
    if (toProcess.length > 1) await randDelay(2000, 4000);
  }

  console.log(`\nHoàn tất. Đã xử lý ${toProcess.length} chapter(s).`);
  await browser.close();
}

main().catch(console.error);
