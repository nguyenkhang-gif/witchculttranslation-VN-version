const fetch = require("node-fetch");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "output");
const TXT_DIR = path.join(__dirname, "txt");
const TXT_VN_DIR = path.join(__dirname, "txtVN");

async function scrapeChapter(url) {
  const res = await fetch(url);
  const data = await res.text();
  const $ = cheerio.load(data);

  const title = $("h1.entry-title").text().trim();
  const nextChapUrl = $(".nav-next a").attr("href") || null;
  const contentHtml = $(".entry-content").html()?.trim() || "";

  return { title, nextChapUrl, contentHtml };
}

function htmlToText($, el) {
  let text = "";
  $(el).contents().each(function () {
    const node = this;
    if (node.type === "text") { text += node.data; return; }
    if (node.type !== "tag") return;
    const tag = node.name.toLowerCase();
    if (tag === "br") {
      text += "\n";
    } else if (["p", "div", "h1", "h2", "h3", "h4"].includes(tag)) {
      const inner = htmlToText($, node).trim();
      if (inner) text += inner + "\n\n";
    } else if (tag === "li") {
      const inner = htmlToText($, node).trim();
      if (inner) text += "• " + inner + "\n";
    } else if (["ul", "ol"].includes(tag)) {
      text += htmlToText($, node) + "\n";
    } else {
      text += htmlToText($, node);
    }
  });
  return text;
}

function contentHtmlToText(title, contentHtml) {
  const $ = cheerio.load(`<div id="root">${contentHtml}</div>`);
  const raw = htmlToText($, $("#root").get(0));
  return [title, "", raw].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function writeChapterFile(index, title, contentHtml) {
  const filename = `chapter_${String(index).padStart(3, "0")}.html`;
  const filepath = path.join(OUTPUT_DIR, filename);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { max-width: 800px; margin: 40px auto; font-family: Georgia, serif; line-height: 1.8; padding: 0 20px; }
    h1 { font-size: 1.4em; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
    a { color: #555; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p><a href="../index.html">← Back to Index</a></p>
  ${contentHtml}
</body>
</html>`;

  fs.writeFileSync(filepath, html, "utf8");
  return filename;
}

function writeIndexFile(chapters) {
  const rows = chapters
    .map(
      ({ index, title, filename }) =>
        `  <li><a href="output/${filename}">${index}. ${title}</a></li>`
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Witch Cult Translation – Index</title>
  <style>
    body { max-width: 800px; margin: 40px auto; font-family: Georgia, serif; line-height: 1.8; padding: 0 20px; }
    h1 { font-size: 1.6em; }
    li { margin: 4px 0; }
    a { color: #333; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Witch Cult Translations</h1>
  <ol>
${rows}
  </ol>
</body>
</html>`;

  fs.writeFileSync(path.join(__dirname, "index.html"), html, "utf8");
}

async function main() {
  const startUrl =
    "https://witchculttranslation.com/2023/12/04/arc-6-chapter-1-the-dragon-carriages-way-back/";

  for (const dir of [OUTPUT_DIR, TXT_DIR, TXT_VN_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  }

  const chapters = [];
  let url = startUrl;
  let index = 1;

  while (url) {
    console.log(`[${index}] Scraping: ${url}`);
    const { title, nextChapUrl, contentHtml } = await scrapeChapter(url);
    const filename = writeChapterFile(index, title, contentHtml);

    const txtName = `chapter_${String(index).padStart(3, "0")}.txt`;
    const txtContent = contentHtmlToText(title, contentHtml);
    fs.writeFileSync(path.join(TXT_DIR, txtName), txtContent, "utf8");
    fs.writeFileSync(path.join(TXT_VN_DIR, txtName), "", "utf8");

    chapters.push({ index, title, filename });
    console.log(`    ✓ ${title}`);
    url = nextChapUrl;
    index++;
  }

  writeIndexFile(chapters);
  console.log(`\nDone. ${chapters.length} chapters saved. index.html created.`);
}

main().catch(console.error);
