const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const OUTPUT_DIR = path.join(__dirname, "output");
const TXT_DIR = path.join(__dirname, "txt");
const TXT_VN_DIR = path.join(__dirname, "txtVN");

function htmlToText($, el) {
  let text = "";

  $(el)
    .contents()
    .each(function () {
      const node = this;

      if (node.type === "text") {
        text += node.data;
        return;
      }

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

function convertFile(filepath) {
  const html = fs.readFileSync(filepath, "utf8");
  const $ = cheerio.load(html);

  // remove nav link "← Back to Index"
  $('p:has(a[href="../index.html"])').remove();

  const title = $("h1").first().text().trim();
  $("h1").first().remove();

  const body = htmlToText($, $("body").get(0));

  const result = [title, "", body]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return result;
}

function main() {
  if (!fs.existsSync(TXT_DIR)) fs.mkdirSync(TXT_DIR);
  if (!fs.existsSync(TXT_VN_DIR)) fs.mkdirSync(TXT_VN_DIR);

  const files = fs
    .readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith(".html"))
    .sort();

  for (const file of files) {
    const txtName = file.replace(".html", ".txt");
    const text = convertFile(path.join(OUTPUT_DIR, file));

    fs.writeFileSync(path.join(TXT_DIR, txtName), text, "utf8");

    const vnPath = path.join(TXT_VN_DIR, txtName);
    if (!fs.existsSync(vnPath)) {
      fs.writeFileSync(vnPath, "", "utf8");
      console.log(`✓ ${txtName} → txtVN/${txtName} (mới)`);
    } else {
      console.log(`✓ ${txtName} (txtVN đã có, bỏ qua)`);
    }
  }

  console.log(`\nDone. ${files.length} files converted to txt/`);
}

main();
