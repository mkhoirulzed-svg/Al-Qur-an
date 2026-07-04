const fs = require("fs");
const path = require("path");

const SOURCE_URL = "https://riyadh.islamenc.com/id";

const ROOT_DIR = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data", "riyadhus");

// Sesuaikan kalau nama index kamu beda
const INDEX_CANDIDATES = [
  path.join(DATA_DIR, "index.json"),
  path.join(DATA_DIR, "kitab-index.json"),
  path.join(DATA_DIR, "riyadhus-index.json"),
  path.join(ROOT_DIR, "data", "riyadhus.json"),
];

function pad(num) {
  return String(num).padStart(3, "0");
}

function decodeHtml(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanTitle(title) {
  return decodeHtml(title)
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchTitles() {
  const res = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!res.ok) {
    throw new Error(`Gagal mengambil sumber judul: ${res.status}`);
  }

  const html = await res.text();

  const titles = new Map();

  // Ambil teks dari tag <a>...</a>
  const anchorRegex = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(html)) !== null) {
    const raw = match[1]
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const m = raw.match(/^(\d{1,3})\s*[-ـ–—]\s*(BAB\s+.+)$/i);
    if (!m) continue;

    let num = Number(m[1]);
    let title = cleanTitle(m[2]);

    // Koreksi typo di sumber Indonesia: Bab 332 kadang tertulis 322
    if (
      num === 322 &&
      title.includes("AMPUNILAH AKU BILA ENGKAU KEHENDAKI")
    ) {
      num = 332;
    }

    if (num >= 1 && num <= 372) {
      titles.set(num, `Bab ${num}. ${toTitleCase(title.replace(/^BAB\s+/i, ""))}`);
    }
  }

  if (titles.size !== 372) {
    const missing = [];
    for (let i = 1; i <= 372; i++) {
      if (!titles.has(i)) missing.push(i);
    }

    throw new Error(
      `Judul tidak lengkap. Dapat ${titles.size}/372. Missing: ${missing.join(", ")}`
    );
  }

  return titles;
}

function toTitleCase(text) {
  // Biar tampilan tidak ALL CAPS
  return text
    .toLowerCase()
    .replace(/(^|[\s\-("'`])([a-zà-žāīūṣḍṭẓḥḣḵḡq`])/gi, (m, sep, chr) => {
      return sep + chr.toUpperCase();
    })
    .replace(/\bDan\b/g, "dan")
    .replace(/\bDi\b/g, "di")
    .replace(/\bKe\b/g, "ke")
    .replace(/\bDari\b/g, "dari")
    .replace(/\bYang\b/g, "yang")
    .replace(/\bUntuk\b/g, "untuk")
    .replace(/\bDengan\b/g, "dengan")
    .replace(/\bAtau\b/g, "atau")
    .replace(/\bDalam\b/g, "dalam");
}

function findIndexFile() {
  return INDEX_CANDIDATES.find((file) => fs.existsSync(file));
}

function updateIndexFile(titles) {
  const indexFile = findIndexFile();

  if (!indexFile) {
    console.log("Index file tidak ditemukan. Lewati update index.");
    return;
  }

  const data = JSON.parse(fs.readFileSync(indexFile, "utf8"));

  if (!Array.isArray(data)) {
    throw new Error(`Format index bukan array: ${indexFile}`);
  }

  let changed = 0;

  for (const item of data) {
    const id = Number(item.id ?? item.source_id);
    const title = titles.get(id);

    if (!title) continue;

    if (item.judul !== title) {
      item.judul = title;
      changed++;
    }

    if (!item.file) {
      item.file = `${pad(id)}.json`;
    }
  }

  fs.writeFileSync(indexFile, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`Index diperbarui: ${indexFile}`);
  console.log(`Judul index berubah: ${changed}`);
}

function updateChapterFiles(titles) {
  let changed = 0;
  let skippedArray = 0;

  for (let id = 1; id <= 372; id++) {
    const file = path.join(DATA_DIR, `${pad(id)}.json`);
    if (!fs.existsSync(file)) continue;

    const title = titles.get(id);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));

    let modified = false;

    if (Array.isArray(data)) {
      // Kalau file bab berupa array hadits, jangan ubah struktur besar.
      // Tapi kalau item pertama punya metadata judul_bab / bab / kitab, update.
      if (data[0] && typeof data[0] === "object") {
        if ("judul_bab" in data[0]) {
          data[0].judul_bab = title;
          modified = true;
        } else if ("bab" in data[0]) {
          data[0].bab = title;
          modified = true;
        } else if ("kitab" in data[0]) {
          data[0].kitab = title;
          modified = true;
        } else {
          skippedArray++;
        }
      }
    } else if (data && typeof data === "object") {
      data.judul = title;

      if (data.bab && typeof data.bab === "object") {
        data.bab.judul = title;
      }

      modified = true;
    }

    if (modified) {
      fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
      changed++;
    }
  }

  console.log(`File bab diperbarui: ${changed}`);
  console.log(`File bab array dilewati karena tidak punya field judul: ${skippedArray}`);
}

async function main() {
  const titles = await fetchTitles();

  console.log(`Berhasil mengambil ${titles.size} judul bab.`);

  updateIndexFile(titles);
  updateChapterFiles(titles);

  console.log("Selesai memperbaiki judul Riyadhus Shalihin.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
