const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SOURCE_URL =
  "https://raw.githubusercontent.com/mazipan/baca-quran.id/master/src/data/daily-doa.ts";

const OUT_FILE = path.join(__dirname, "..", "data", "doa-harian.json");

function cleanText(text) {
  if (text === null || text === undefined) return "";

  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function extractDailyDoaArray(content) {
  const marker = "const dailyDoa";
  const markerIndex = content.indexOf(marker);

  if (markerIndex === -1) {
    console.log("Preview isi sumber:");
    console.log(content.slice(0, 1000));
    throw new Error("Tidak menemukan const dailyDoa");
  }

  const equalIndex = content.indexOf("=", markerIndex);

  if (equalIndex === -1) {
    throw new Error("Tidak menemukan tanda = setelah const dailyDoa");
  }

  // PENTING:
  // cari [ setelah tanda =
  // bukan [ pada DailyDoaItem[]
  const arrayStart = content.indexOf("[", equalIndex);

  if (arrayStart === -1) {
    throw new Error("Tidak menemukan awal array dailyDoa");
  }

  let depth = 0;
  let inString = false;
  let stringChar = "";
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = arrayStart; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === "[") depth++;
    if (char === "]") depth--;

    if (depth === 0) {
      return content.slice(arrayStart, i + 1);
    }
  }

  throw new Error("Tidak menemukan akhir array dailyDoa");
}

function parseTsArray(arrayText) {
  // Array di file TS masih valid sebagai JavaScript expression:
  // boleh single quote, comment, trailing comma, unquoted key.
  return vm.runInNewContext("(" + arrayText + ")", {});
}

function convertItem(item) {
  return {
    id: cleanText(item.id),
    judul: cleanText(item.title),
    arab: cleanText(item.arabic),
    latin: cleanText(item.latin),
    arti: cleanText(item.translation),
    sumber: cleanText(item.source)
  };
}

async function main() {
  console.log("Mengambil daily-doa.ts dari mazipan/baca-quran.id...");

  const res = await fetch(SOURCE_URL);

  if (!res.ok) {
    throw new Error(`Gagal mengambil data. Status: ${res.status}`);
  }

  const tsContent = await res.text();

  console.log("File sumber berhasil diambil.");
  console.log("Mencari array setelah: const dailyDoa ... = [");

  const arrayText = extractDailyDoaArray(tsContent);
  const data = parseTsArray(arrayText);

  if (!Array.isArray(data)) {
    throw new Error("Hasil parse bukan array");
  }

  if (data.length === 0) {
    throw new Error("Data dailyDoa kosong. Kemungkinan array yang diambil salah.");
  }

  const result = data.map(convertItem);

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), "utf8");

  console.log(`Berhasil membuat ${result.length} doa`);
  console.log(`Output: ${OUT_FILE}`);
  console.log("Contoh item pertama:");
  console.log(JSON.stringify(result[0], null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
