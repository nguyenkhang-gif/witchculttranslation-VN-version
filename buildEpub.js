const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const readline = require("readline");

const SOURCES = {
  txt:    { dir: "txt",    label: "Bản gốc tiếng Anh (txt/)",        lang: "en" },
  txtVN:  { dir: "txtVN",  label: "Bản dịch thủ công (txtVN/)",      lang: "vi" },
  gptres: { dir: "gptres", label: "Bản dịch GPT/Gemini (gptres/)",   lang: "vi" },
};

const BUILD_DIR    = path.join(__dirname, "_epub_build");
const OUT_DIR      = path.join(__dirname, "epubs");
const COVER_IMAGE  = path.join(__dirname, "thumbnails", "index.jpg");

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(q, (a) => { rl.close(); r(a.trim()); }));
}

function escapeXml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function txtToXhtml(raw, title) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n").slice(1); // skip title line
  const paras = [];
  let buf = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (buf.length) { paras.push(buf.join(" ")); buf = []; }
      continue;
    }
    if (/^[※＊\s*]+$/.test(t)) {
      if (buf.length) { paras.push(buf.join(" ")); buf = []; }
      paras.push("※");
      continue;
    }
    buf.push(t);
  }
  if (buf.length) paras.push(buf.join(" "));

  const body = paras.map((p) => {
    if (p === "※") return `<p class="div">※　※　※</p>`;
    const txt = escapeXml(p);
    if (p.startsWith("——") || /^[\w\s]+:\s*\[/.test(p))
      return `<p class="dlg">${txt}</p>`;
    return `<p>${txt}</p>`;
  }).join("\n    ");

  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="../style.css"/>
</head>
<body>
  <h2>${escapeXml(title)}</h2>
  ${body}
</body>
</html>`;
}

const CSS = `body{font-family:Georgia,serif;font-size:1em;line-height:1.8;margin:1em 1.5em;color:#1a1a1a}
h2{font-size:1.15em;text-align:center;border-bottom:1px solid #ccc;padding-bottom:.5em;margin:1.5em 0 1em}
p{margin:.4em 0;text-indent:1em}
p.dlg{text-indent:0;margin:.5em 0}
p.div{text-align:center;text-indent:0;color:#999;margin:1.2em 0;letter-spacing:.4em}`;

async function main() {
  // CLI args: node buildEpub.js [txt|txtVN|gptres] [filename.epub]
  const argSrc = process.argv[2];
  const argOut = process.argv[3];

  let srcKey;
  if (argSrc && SOURCES[argSrc]) {
    srcKey = argSrc;
  } else {
    console.log("\nChọn nguồn:");
    Object.entries(SOURCES).forEach(([k, v], i) => console.log(`  ${i+1}. [${k}]  ${v.label}`));
    const srcAns = await ask("Nhập số (1/2/3): ");
    srcKey = Object.keys(SOURCES)[parseInt(srcAns) - 1];
    if (!srcKey) { console.log("Không hợp lệ."); process.exit(1); }
  }

  const { dir, lang } = SOURCES[srcKey];
  const srcDir = path.join(__dirname, dir);
  if (!fs.existsSync(srcDir)) { console.log(`Folder ${dir}/ không tồn tại.`); process.exit(1); }

  const files = fs.readdirSync(srcDir).filter(f => f.endsWith(".txt")).sort();
  if (!files.length) { console.log("Không có file .txt nào."); process.exit(1); }

  const defaultOut = `rezero-arc6-${srcKey}.epub`;
  const outFile = path.resolve(OUT_DIR, argOut || defaultOut);

  // Build
  console.log(`\nĐọc ${files.length} chapters...`);
  const chapters = files.map((f) => {
    const raw   = fs.readFileSync(path.join(srcDir, f), "utf-8");
    const title = raw.split("\n")[0].trim() || f.replace(".txt","");
    const id    = f.replace(".txt","");
    return { id, title, raw };
  });

  // Clean build dir
  if (fs.existsSync(BUILD_DIR)) fs.rmSync(BUILD_DIR, { recursive: true });
  fs.mkdirSync(path.join(BUILD_DIR, "META-INF"), { recursive: true });
  fs.mkdirSync(path.join(BUILD_DIR, "OEBPS", "chapters"), { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // mimetype
  fs.writeFileSync(path.join(BUILD_DIR, "mimetype"), "application/epub+zip");

  // container.xml
  fs.writeFileSync(path.join(BUILD_DIR, "META-INF", "container.xml"),
`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  // style.css
  fs.writeFileSync(path.join(BUILD_DIR, "OEBPS", "style.css"), CSS);

  // cover image
  const hasCover = fs.existsSync(COVER_IMAGE);
  if (hasCover) {
    fs.mkdirSync(path.join(BUILD_DIR, "OEBPS", "images"), { recursive: true });
    fs.copyFileSync(COVER_IMAGE, path.join(BUILD_DIR, "OEBPS", "images", "cover.jpg"));
    fs.writeFileSync(path.join(BUILD_DIR, "OEBPS", "chapters", "cover.xhtml"),
`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
  <title>Cover</title>
  <style>body{margin:0;padding:0;text-align:center}img{max-width:100%;height:auto}</style>
</head>
<body><img src="../images/cover.jpg" alt="Cover"/></body>
</html>`);
    console.log("  ✓ cover.jpg");
  }

  // chapters
  const manifest = [];
  const spine    = [];
  const nav      = [];

  for (const [i, ch] of chapters.entries()) {
    fs.writeFileSync(
      path.join(BUILD_DIR, "OEBPS", "chapters", `${ch.id}.xhtml`),
      txtToXhtml(ch.raw, ch.title)
    );
    manifest.push(`    <item id="${ch.id}" href="chapters/${ch.id}.xhtml" media-type="application/xhtml+xml"/>`);
    spine.push(`    <itemref idref="${ch.id}"/>`);
    nav.push(`    <navPoint id="nav${i+1}" playOrder="${i+1}">
      <navLabel><text>${escapeXml(ch.title)}</text></navLabel>
      <content src="chapters/${ch.id}.xhtml"/>
    </navPoint>`);
    process.stdout.write(`  ✓ ${ch.id}\r`);
  }
  console.log(`\n  ${chapters.length} chapters OK`);

  const uid = `urn:uuid:rezero-${Date.now()}`;

  const coverManifest = hasCover
    ? `    <item id="cover-image" href="images/cover.jpg" media-type="image/jpeg"/>
    <item id="cover-page" href="chapters/cover.xhtml" media-type="application/xhtml+xml"/>`
    : "";
  const coverSpine  = hasCover ? `    <itemref idref="cover-page" linear="no"/>` : "";
  const coverMeta   = hasCover ? `    <meta name="cover" content="cover-image"/>` : "";
  const coverGuide  = hasCover
    ? `  <guide>\n    <reference type="cover" title="Cover" href="chapters/cover.xhtml"/>\n  </guide>`
    : "";

  // content.opf
  fs.writeFileSync(path.join(BUILD_DIR, "OEBPS", "content.opf"),
`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Re:Zero – Arc 6</dc:title>
    <dc:creator>Tappei Nagatsuki</dc:creator>
    <dc:language>${lang}</dc:language>
    <dc:identifier id="bookId">${uid}</dc:identifier>
${coverMeta}
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
${coverManifest}
${manifest.join("\n")}
  </manifest>
  <spine toc="ncx">
${coverSpine}
${spine.join("\n")}
  </spine>
${coverGuide}
</package>`);

  // toc.ncx
  fs.writeFileSync(path.join(BUILD_DIR, "OEBPS", "toc.ncx"),
`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${uid}"/></head>
  <docTitle><text>Re:Zero – Arc 6</text></docTitle>
  <navMap>
${nav.join("\n")}
  </navMap>
</ncx>`);

  // Pack
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
  console.log("📦 Packing EPUB...");
  execSync(`cd "${BUILD_DIR}" && zip -0 -X "${outFile}" mimetype`);
  execSync(`cd "${BUILD_DIR}" && zip -r "${outFile}" META-INF OEBPS`);
  fs.rmSync(BUILD_DIR, { recursive: true });

  const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`✅ Done → epubs/${path.basename(outFile)}  (${kb} KB)`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
