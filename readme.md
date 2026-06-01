# Re:Zero – Arc 6 Vietnamese Translation

Bộ công cụ scrape, build prompt và dịch tự động Arc 6 từ [witchculttranslation.com](https://witchculttranslation.com).

---

## Cài đặt

```bash
npm install
node init.js
```

---

## Cấu trúc thư mục

```
.
├── contexts/
│   └── reZero.json        # Context dịch: nhân vật, thuật ngữ, style guide, system prompt
├── txt/                   # Bản gốc tiếng Anh (scrape từ web)
├── txtVN/                 # Bản dịch tiếng Việt thủ công
├── gptres/                # Bản dịch GPT (output của gptres.js)
├── output/                # HTML từng chapter — gitignored, tạo bởi app.js
├── prompts/               # Prompt AI — gitignored, tạo bởi buildPrompt.js
├── chatgpt-test/
│   └── chatgpt.js         # Tool cũ: gửi 1 chapter lên ChatGPT
├── app.js                 # Scraper chính
├── toTxt.js               # Convert HTML → txt/
├── buildPrompt.js         # Build prompt từ context + txt/
├── gptres.js              # Tự động dịch hàng loạt qua ChatGPT
├── buildEpub.js           # Xuất EPUB từ txt / txtVN / gptres
└── init.js                # Tạo các thư mục cần thiết
```

---

## Quy trình đầy đủ

### Bước 1 — Scrape chapters

```bash
node app.js
```

Scrape toàn bộ Arc 6 từ đầu đến cuối. Tạo ra:
- `output/chapter_XXX.html`
- `txt/chapter_XXX.txt` (plain text tiếng Anh)
- `txtVN/chapter_XXX.txt` (rỗng, chờ dịch)

### Bước 2 — Build prompt dịch

```bash
node buildPrompt.js
```

Đọc `contexts/reZero.json` + từng file trong `txt/`, xuất prompt vào `prompts/`.  
Mỗi file gồm 2 phần: `=== SYSTEM ===` (context AI) và `=== USER ===` (nội dung chapter).

### Bước 3 — Dịch tự động qua ChatGPT

```bash
node gptres.js
```

- Nếu `PRESET` trong file có index → chạy thẳng các chapter đó.
- Nếu `PRESET = []` → hiện danh sách pending, chọn index hoặc `all`.
- Tự động skip chapter đã có trong `gptres/`.
- Lưu response vào `gptres/chapter_XXX.txt`.

### Bước 4 — Xuất EPUB

```bash
node buildEpub.js
```

Hỏi nguồn văn bản:
1. `txt` — bản gốc tiếng Anh
2. `txtVN` — bản dịch thủ công
3. `gptres` — bản dịch GPT

Xuất file `.epub` không cần cài thêm package.

---

## Kiểm tra chapters còn thiếu

```bash
comm -23 <(ls txt/ | sort) <(ls gptres/ | sort)
```

---

## Chỉnh context dịch

Sửa `contexts/reZero.json`:

| Field | Mô tả |
|---|---|
| `characters` | Thêm/sửa nhân vật, giọng nói, xưng hô |
| `glossary` | Thuật ngữ cố định (EN → VI) |
| `baseSystemPrompt` | Hướng dẫn chính cho AI |
| `translationStyle` | Quy tắc dấu câu, cấu trúc câu, tone |
| `chapterSummaries` | Tóm tắt chapter để AI có ngữ cảnh |

Sau khi sửa, chạy lại `node buildPrompt.js` để regenerate prompts.

---

## Git

```bash
# Lần đầu push
git add .
git commit -m "init"
git branch -M main
git push -u origin main

# Các lần sau
git add .
git commit -m "message"
git push
```

**Không được commit:** `node_modules/`, `output/`, `prompts/`, `txt/`, `txtVN/`, `gptres/`, `index.html`, `*.epub`  
**Nên commit:** `contexts/`, tất cả script `.js`, `package.json`
