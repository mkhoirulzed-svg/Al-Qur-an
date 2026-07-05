const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const KITAB_JSON = path.join(DATA_DIR, "kitab.json");

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

function getFolderFromKitab(kitab) {
  if (kitab.folder) {
    return String(kitab.folder)
      .replace(/^data\//, "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
  }

  if (kitab.daftarBab) {
    const clean = String(kitab.daftarBab).replace(/^\/+/, "");

    if (clean.startsWith("data/")) {
      const parts = clean.split("/");
      return parts[1];
    }

    const parts = clean.split("/");
    return parts[0];
  }

  if (kitab.path) {
    const clean = String(kitab.path)
      .replace(/^\/+/, "")
      .replace(/^data\//, "");

    const parts = clean.split("/");
    return parts[0];
  }

  return kitab.id;
}

function extractHaditsArray(json) {
  if (Array.isArray(json)) return json;

  if (!json || typeof json !== "object") return [];

  const candidates = [
    json.hadits,
    json.data,
    json.items,
    json.list,
    json.isi,
    json.daftar,
    json.riwayat,
    json.contents,
    json.content,

    json.data?.hadits,
    json.data?.items,
    json.data?.list,
    json.data?.isi,
    json.data?.daftar,

    json.result?.hadits,
    json.result?.items,
    json.result?.list,
    json.result?.isi,

    json.bab?.hadits,
    json.bab?.items,
    json.bab?.list,
    json.bab?.isi
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function getTextField(item, fields) {
  for (const field of fields) {
    if (item[field] !== undefined && item[field] !== null && item[field] !== "") {
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

function findBabFiles(kitabDir) {
  const files = fs.readdirSync(kitabDir);

  // Prioritas utama: 001.json, 002.json, dst
  let babFiles = files
    .filter(file => /^\d{3}\.json$/.test(file))
    .sort();

  if (babFiles.length > 0) return babFiles;

  // Cadangan kalau namanya 1.json, 2.json, dst
  babFiles = files
    .filter(file => /^\d+\.json$/.test(file))
    .filter(file => !["kitab.json", "daftar-bab.json", "search-index.json"].includes(file))
    .sort((a, b) => Number(a.replace(".json", "")) - Number(b.replace(".json", "")));

  return babFiles;
}

function normalizeBabId(file) {
  const raw = file.replace(".json", "");
  return raw.padStart(3, "0");
}

function buildOneKitab(kitab) {
  const kitabId = kitab.id;
  const status = kitab.status || "";

  console.log("\n==============================");
  console.log(`KITAB: ${kitabId}`);
  console.log(`STATUS: ${status || "-"}`);

  if (status !== "tersedia") {
    console.log(`LEWATI: status bukan tersedia`);
    return;
  }

  const folder = getFolderFromKitab(kitab);
  const kitabDir = path.join(DATA_DIR, folder);

  console.log(`FOLDER: data/${folder}`);

  if (!fs.existsSync(kitabDir)) {
    console.log(`LEWATI: folder tidak ditemukan`);
    return;
  }

  const files = findBabFiles(kitabDir);

  console.log(`JUMLAH FILE BAB: ${files.length}`);

  if (files.length === 0) {
    console.log(`LEWATI: tidak ada file 001.json / 1.json dst`);
    return;
  }

  const result = [];

  for (const file of files) {
    const filePath = path.join(kitabDir, file);
    const babId = normalizeBabId(file);

    try {
      const json = readJson(filePath);
      const haditsArray = extractHaditsArray(json);

      if (!Array.isArray(haditsArray) || haditsArray.length === 0) {
        const keys = json && typeof json === "object" ? Object.keys(json).join(", ") : "bukan object";
        console.log(`KOSONG: data/${folder}/${file} | keys: ${keys}`);
        continue;
      }

      haditsArray.forEach((item, index) => {
        result.push(normalizeItem(item, kitabId, babId, index));
      });

      console.log(`OK: data/${folder}/${file} -> ${haditsArray.length} item`);
    } catch (err) {
      console.log(`ERROR: data/${folder}/${file} -> ${err.message}`);
    }
  }

  const outputPath = path.join(kitabDir, "search-index.json");
  writeJson(outputPath, result);

  console.log(`HASIL: ${result.length} item`);
  console.log(`OUTPUT: data/${folder}/search-index.json`);
}

function main() {
  if (!fs.existsSync(KITAB_JSON)) {
    throw new Error("data/kitab.json tidak ditemukan");
  }

  const kitabList = readJson(KITAB_JSON);

  if (!Array.isArray(kitabList)) {
    throw new Error("Format data/kitab.json harus array []");
  }

  kitabList.forEach(kitab => {
    buildOneKitab(kitab);
  });
}

main();
