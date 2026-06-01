const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");
puppeteer.use(StealthPlugin());

const PROMPTS_DIR = path.join(__dirname, "../prompts");
const GPTRES_DIR = path.join(__dirname, "../gptres");

const readline = require("readline");

const files = fs.readdirSync(PROMPTS_DIR).filter((f) => f.endsWith(".txt")).sort();

async function askIndex() {
  console.log("\nDanh sách chapters:");
  files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`\nNhập index (1-${files.length}): `, (ans) => {
      rl.close();
      const n = parseInt(ans);
      if (isNaN(n) || n < 1 || n > files.length) {
        console.log("Index không hợp lệ.");
        process.exit(1);
      }
      resolve(n);
    });
  });
}

const randomDelay = (min = 500, max = 2000) =>
  new Promise((r) => setTimeout(r, min + Math.floor(Math.random() * (max - min + 300))));

async function main() {
  const idx = await askIndex();
  const CHAPTER = files[idx - 1].replace(".txt", "");
  const MESSAGE = fs.readFileSync(path.join(PROMPTS_DIR, files[idx - 1]), "utf-8").trim();
  console.log(`\nChạy: ${CHAPTER} (${idx}/${files.length})\n`);

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
        const btns = [...document.querySelectorAll("button")];
        const btn = btns.find((b) =>
          /accept|agree|got it|ok|đồng ý/i.test(b.innerText)
        );
        if (btn) { btn.click(); return true; }
        return false;
      },
      { timeout: 5000 }
    );
    console.log("Đã click accept cookie.");
  } catch (_) {}

  await page.waitForSelector("#prompt-textarea", { timeout: 15000 });
  await page.click("#prompt-textarea");

  // Insert text trực tiếp vào contenteditable div
  await randomDelay(800, 1500);
  await page.evaluate((text) => {
    const el = document.querySelector("#prompt-textarea");
    el.focus();
    document.execCommand("insertText", false, text);
  }, MESSAGE);
  console.log("Đã insert text.");

  await randomDelay(500, 1200);
  await page.keyboard.press("Enter");
  console.log("Đã gửi message. Đợi response...");

  // Đợi response hoàn tất bằng cách poll đến khi text không đổi trong 3s
  console.log("Đang đợi response...");
  const response = await (async () => {
    const getLastMsg = () => page.evaluate(() => {
      const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
      const last = msgs[msgs.length - 1];
      return last ? last.innerText.trim() : "";
    });

    let prev = "";
    let stableMs = 0;
    const interval = 1000;
    const stableThreshold = 3000;

    while (stableMs < stableThreshold) {
      await new Promise((r) => setTimeout(r, interval));
      const cur = await getLastMsg();
      if (cur && cur === prev) {
        stableMs += interval;
      } else {
        stableMs = 0;
        prev = cur;
      }
    }
    return prev;
  })();

  if (response) {
    if (!fs.existsSync(GPTRES_DIR)) fs.mkdirSync(GPTRES_DIR);
    const outPath = path.join(GPTRES_DIR, `${CHAPTER}.txt`);
    fs.writeFileSync(outPath, response, "utf-8");
    console.log(`Đã lưu response → gptres/${CHAPTER}.txt`);
  } else {
    console.log("Không lấy được response.");
  }

  await browser.close();
}

main().catch(console.error);
