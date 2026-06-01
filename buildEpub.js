const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const readline = require("readline");

const SOURCES = {
  txt: { dir: "txt", label: "Bản gốc tiếng Anh (txt/)" },
  txtVN: { dir: "txtVN", label: "Bản dịch thủ công (txtVN/)" },
  gptres: { dir: "gptres", label: "Bản dịch GPT (gptres/)" },
};

const BOOK_TITLE = "Re:Zero – Arc 6";
const BOOK_AUTHOR = "Tappei Nagatsuki";
const BOOK_LANG_MAP = { txt: "en", txtVN: "vi", gptres: "vi" };

// ── helpers ──────────────────────────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); })
  );
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── text → XHTML ─────────────────────────────────────────────────────────────

function txtToXhtml(rawText, chapterId) {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");

  // Line 1 is always the title
  const title = lines[0].trim();
  const bodyLines = lines.slice(1);

  const paragraphs = [];
  let currentPara = [];

  for (const line of bodyLines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      if (currentPara.length > 0) {
        paragraphs.push({ type: "p", text: currentPara.join(" ") });
        currentPara = [];
      }
      continue;
    }

    // Section divider ※
    if (/^[※＊\*\s]+$/.test(trimmed) || trimmed === "※") {
      if (currentPara.length > 0) {
        paragraphs.push({ type: "p", text: currentPara.join(" ") });
        currentPara = [];
      }
      paragraphs.push({ type: "divider" });
      continue;
    }

    currentPara.push(trimmed);
  }
  if (currentPara.length > 0) {
    paragraphs.push({ type: "p", text: currentPara.join(" ") });
  }

  const bodyHtml = paragraphs
    .map((p) => {
      if (p.type === "divider") return `<p class="divider">※　※　※</p>`;
      const text = escapeXml(p.text);
      // Dialogue lines starting with —— or character name
      if (p.text.startsWith("——") || /^[A-Za-zÀ-ỹ\s]+:\s*\[/.test(p.text)) {
        return `<p class="dialogue">${text}</p>`;
      }
      return `<p>${text}</p>`;
    })
    .join("\n    ");

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN"
  "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="vi">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="../style.css"/>
</head>
<body>
  <h2 class="chapter-title">${escapeXml(title)}</h2>
  ${bodyHtml}
</body>
</html>`;
}

// ── CSS ──────────────────────────────────────────────────────────────────────

const STYLE_CSS = `
body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1em;
  line-height: 1.8;
  margin: 1em 1.5em;
  color: #1a1a1a;
}
h2.chapter-title {
  font-size: 1.2em;
  font-weight: bold;
  margin: 1.5em 0 1em;
  text-align: center;
  border-bottom: 1px solid #ccc;
  padding-bottom: 0.5em;
}
p {
  margin: 0.4em 0;
  text-indent: 1em;
}
p.dialogue {
  text-indent: 0;
  margin: 0.5em 0;
}
p.divider {
  text-align: center;
  text-indent: 0;
  color: #888;
  margin: 1.2em 0;
  letter-spacing: 0.4em;
}
`.trim();

// ── OPF ──────────────────────────────────────────────────────────────────────

function buildOpf(chapterFiles, lang, title, author) {
  const manifestItems = chapterFiles
    .map(
      (f) =>
        `    <item id="${f.id}" href="chapters/${f.id}.xhtml" media-type="application/xhtml+xml"/>`
    )
    .join("\n");

  const spineItems = chapterFiles
    .map((f) => `    <itemref idref="${f.id}"/>`)
    .join("\n");

  const uid = `urn:uuid:rezero-arc6-${Date.now()}`;

  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>${lang}</dc:language>
    <dc:identifier id="BookId">${uid}</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
${manifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`;
}

// ── NCX ──────────────────────────────────────────────────────────────────────

function buildNcx(chapterFiles, title) {
  const navPoints = chapterFiles
    .map(
      (f, i) => `  <navPoint id="nav${i + 1}" playOrder="${i + 1}">
    <navLabel><text>${escapeXml(f.title)}</text></navLabel>
    <content src="chapters/${f.id}.xhtml"/>
  </navPoint>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN"
  "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="rezero-arc6"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Pick source
  console.log("\nChọn nguồn văn bản:");
  Object.entries(SOURCES).forEach(([key, { label }], i) =>
    console.log(`  ${i + 1}. [${key}]  ${label}`)
  );
  const srcAns = await ask("Nhập số (1/2/3): ");
  const srcKey = Object.keys(SOURCES)[parseInt(srcAns) - 1];
  if (!srcKey) { console.log("Lựa chọn không hợp lệ."); process.exit(1); }

  const srcDir = path.join(__dirname, SOURCES[srcKey].dir);
  if (!fs.existsSync(srcDir)) {
    console.log(`Folder ${SOURCES[srcKey].dir}/ không tồn tại.`); process.exit(1);
  }

  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".txt")).sort();
  if (files.length === 0) {
    console.log("Không có file .txt nào trong folder này."); process.exit(1);
  }

  // Output filename
  const defaultOut = `rezero-arc6-${srcKey}.epub`;
  const outAns = await ask(`\nTên file output (Enter = ${defaultOut}): `);
  const outFile = path.join(__dirname, outAns || defaultOut);

  const lang = BOOK_LANG_MAP[srcKey];

  // Build chapter data
  console.log(`\nĐọc ${files.length} chapters từ ${SOURCES[srcKey].dir}/...`);
  const chapterFiles = files.map((f, i) => {
    const raw = fs.readFileSync(path.join(srcDir, f), "utf-8");
    const title = raw.split("\n")[0].trim() || `Chapter ${i + 1}`;
    const id = f.replace(".txt", "");
    return { id, title, raw };
  });

  // Temp dir
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "epub-"));
  const oebps = path.join(tmpDir, "OEBPS");
  const chaptersDir = path.join(oebps, "chapters");
  const metaDir = path.join(tmpDir, "META-INF");

  fs.mkdirSync(oebps); fs.mkdirSync(chaptersDir); fs.mkdirSync(metaDir);

  // mimetype (no compression — written separately)
  fs.writeFileSync(path.join(tmpDir, "mimetype"), "application/epub+zip", "ascii");

  // container.xml
  fs.writeFileSync(
    path.join(metaDir, "container.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:schemas:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  // style.css
  fs.writeFileSync(path.join(oebps, "style.css"), STYLE_CSS);

  // chapters
  for (const ch of chapterFiles) {
    const xhtml = txtToXhtml(ch.raw, ch.id);
    fs.writeFileSync(path.join(chaptersDir, `${ch.id}.xhtml`), xhtml);
    process.stdout.write(`  ✓ ${ch.id}\r`);
  }
  console.log(`\n  ${chapterFiles.length} chapters generated.`);

  // OPF + NCX
  fs.writeFileSync(
    path.join(oebps, "content.opf"),
    buildOpf(chapterFiles, lang, BOOK_TITLE, BOOK_AUTHOR)
  );
  fs.writeFileSync(path.join(oebps, "toc.ncx"), buildNcx(chapterFiles, BOOK_TITLE));

  // Pack EPUB: mimetype first (uncompressed), then everything else
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

  execSync(`cd "${tmpDir}" && zip -X0 "${outFile}" mimetype`);
  execSync(`cd "${tmpDir}" && zip -rg "${outFile}" META-INF OEBPS`);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const size = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`\n✅ Done → ${path.basename(outFile)}  (${size} KB)`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
