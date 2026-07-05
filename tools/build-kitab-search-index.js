const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");

const SKIP_FILES = new Set([
  "kitab.json",
  "daftar-bab.json",
  "search-index.json"
]);

function cleanText(text) {
  if (text === null || text === undefined) return "";

  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function isHaditsLikeObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;

  const keys = Object.keys(obj);

  const textKeys = [
    "arab",
    "arabic",
    "teksArab",
    "textArab",
    "matan",
    "terjemahan",
    "terjemah",
    "indonesia",
    "teksIndonesia",
    "arti",
    "translation",
    "judul",
    "title",
    "latin",
    "faedah",
    "keterangan"
  ];

  return keys.some(key => textKeys.includes(key));
}

function scoreArray(arr) {
  if (!Array.isArray(arr)) return 0;
  if (arr.length === 0) return 0;

  let score = 0;

  for (const item of arr.slice(0, 10)) {
    if (isHaditsLikeObject(item)) score += 3;
    if (typeof item === "object" && item !== null) score += 1;
    if (typeof item === "string" && item.trim().length > 20) score += 1;
  }

  return score;
}

function findBestHaditsArrayDeep(json) {
  const candidates = [];

  function walk(value, pathName, depth) {
    if (depth > 5) return;

    if (Array.isArray(value)) {
      const score = scoreArray(value);

      if (score > 0) {
        candidates.push({
          path: pathName,
          score,
          length: value.length,
          value
        });
      }

      for (let i = 0; i < Math.min(value.length, 5); i++) {
        walk(value[i], `${pathName}[${i}]`, depth + 1);
      }

      return;
    }

    if (value && typeof value === "object") {
      for (const key of Object.keys(value)) {
        walk(value[key], pathName ? `${pathName}.${key}` : key, depth + 1);
      }
    }
  }

  walk(json, "", 0);

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.length - a.length;
  });

  return candidates[0] || null;
}

function getTextField(item, fields) {
  if (!item || typeof item !== "object") return "";

  for (const field of fields) {
    if (
      item[field] !== undefined &&
      item[field] !== null &&
      String(item[field]).trim() !== ""
    ) {
      return item[field];
    }
  }

  return "";
}

function normalizeItem(item, kitabId, babId, index) {
  if (!item || typeof item !== "object") {
    item = {
      terjemahan: String(item || "")
    };
  }

  const idHadits =
    item.id ??
    item.nomor ??
    item.no ??
    item.number ??
    item.hadits ??
    item.noHadits ??
    item.nomorHadits ??
    item.no_hadits ??
    item.noHadis ??
    index + 1;

  const judul =
    getTextField(item, [
      "judul",
      "title",
      "nama",
      "kitab",
      "bab"
    ]) || `Hadits ${idHadits}`;

  const arab = getTextField(item, [
    "arab",
    "arabic",
    "teksArab",
    "textArab",
    "ar",
    "haditsArab",
    "matan"
  ]);

  const latin = getTextField(item, [
    "latin",
    "transliterasi",
    "teksLatin",
    "textLatin"
  ]);

  const terjemahan = getTextField(item, [
    "terjemahan",
    "terjemah",
    "indonesia",
    "teksIndonesia",
    "arti",
    "translation",
    "idn",
    "indo",
    "haditsTerjemah",
    "terjemah_id"
  ]);

  const faedah = getTextField(item, [
    "faedah",
    "pelajaran",
    "kandungan",
    "keterangan",
    "catatan",
    "notes"
  ]);

  const sumber = getTextField(item, [
    "sumber",
    "source",
    "referensi",
    "reference"
  ]);

  return {
    kitab: kitabId,
    bab: babId,
    id: idHadits,
    judul: cleanText(judul),
    arab: cleanText(arab),
    latin: cleanText(latin),
    terjemahan: cleanText(terjemahan),
    faedah: cleanText(faedah),
    sumber: cleanText(sumber),
    url: `kitab-baca.html?kitab=${encodeURIComponent(kitabId)}&bab=${encodeURIComponent(babId)}&hadits=${encodeURIComponent(idHadits)}`
  };
}

function getJsonFilesInFolder(folderPath) {
  return fs
    .readdirSync(folderPath)
    .filter(file => file.endsWith(".json"))
    .filter(file => !SKIP_FILES.has(file))
    .sort((a, b) => {
      const na = Number(a.replace(/\D/g, ""));
      const nb = Number(b.replace(/\D/g, ""));

      if (!Number.isNaN(na) && !Number.isNaN(nb)) {
        return na - nb;
      }

      return a.localeCompare(b);
    });
}

function getBabIdFromFilename(file, fallbackIndex) {
  const raw = file.replace(".json", "");
  const numberOnly = raw.match(/\d+/);

  if (numberOnly) {
    return String(numberOnly[0]).padStart(3, "0");
  }

  return String(fallbackIndex + 1).padStart(3, "0");
}

function buildFolderIndex(folderName) {
  const folderPath = path.join(DATA_DIR, folderName);

  if (!fs.statSync(folderPath).isDirectory()) return;

  const jsonFiles = getJsonFilesInFolder(folderPath);

  console.log("\n==============================");
  console.log(`FOLDER: data/${folderName}`);
  console.log(`JSON FILES: ${jsonFiles.length}`);

  if (jsonFiles.length === 0) {
    console.log("LEWATI: tidak ada file json isi kitab");
    return;
  }

  const result = [];

  jsonFiles.forEach((file, fileIndex) => {
    const filePath = path.join(folderPath, file);
    const babId = getBabIdFromFilename(file, fileIndex);

    try {
      const json = readJson(filePath);
      const found = findBestHaditsArrayDeep(json);

      if (!found) {
        const keys =
          json && typeof json === "object" && !Array.isArray(json)
            ? Object.keys(json).join(", ")
            : Array.isArray(json)
              ? "array kosong / array tidak cocok"
              : typeof json;

        console.log(`KOSONG: ${file} | keys: ${keys}`);
        return;
      }

      const arr = found.value;

      arr.forEach((item, index) => {
        result.push(normalizeItem(item, folderName, babId, index));
      });

      console.log(
        `OK: ${file} -> ${arr.length} item | path: ${found.path || "root"}`
      );
    } catch (err) {
      console.log(`ERROR: ${file} -> ${err.message}`);
    }
  });

  const outputPath = path.join(folderPath, "search-index.json");
  writeJson(outputPath, result);

  console.log(`HASIL: ${result.length} item`);
  console.log(`OUTPUT: data/${folderName}/search-index.json`);
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    throw new Error("Folder data/ tidak ditemukan");
  }

  const folders = fs
    .readdirSync(DATA_DIR)
    .filter(name => {
      const fullPath = path.join(DATA_DIR, name);
      return fs.statSync(fullPath).isDirectory();
    })
    .sort();

  console.log(`TOTAL FOLDER DI data/: ${folders.length}`);

  folders.forEach(folderName => {
    buildFolderIndex(folderName);
  });
}

main();
