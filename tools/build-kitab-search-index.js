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
    return kitab.folder.replace(/^data\//, "").replace(/^\/+/, "").replace(/\/+$/, "");
  }

  if (kitab.daftarBab) {
    const clean = kitab.daftarBab.replace(/^\/+/, "");

    // contoh: data/sahih-muslim/daftar-bab.json
    if (clean.startsWith("data/")) {
      const parts = clean.split("/");
      return parts[1];
    }

    // contoh: sahih-muslim/daftar-bab.json
    const parts = clean.split("/");
    return parts[0];
  }

  if (kitab.path) {
    const clean = kitab.path.replace(/^\/+/, "").replace(/^data\//, "");
    const parts = clean.split("/");
    return parts[0];
  }

  return kitab.id;
}

function extractHaditsArray(json) {
  if (Array.isArray(json)) return json;

  if (json && Array.isArray(json.hadits)) return json.hadits;
  if (json && Array.isArray(json.data)) return json.data;
  if (json && Array.isArray(json.items)) return json.items;
  if (json && Array.isArray(json.list)) return json.list;

  return [];
}

function normalizeItem(item, kitabId, babId, index) {
  const idHadits =
    item.id ??
    item.nomor ??
    item.no ??
    item.number ??
    item.hadits ??
    item.noHadits ??
    index + 1;

  const judul =
    item.judul ||
    item.title ||
    item.nama ||
    `Hadits ${idHadits}`;

  const arab =
    item.arab ||
    item.arabic ||
    item.teksArab ||
    item.textArab ||
    "";

  const latin =
    item.latin ||
    item.transliterasi ||
    item.teksLatin ||
    "";

  const terjemahan =
    item.terjemahan ||
    item.terjemah ||
    item.indonesia ||
    item.teksIndonesia ||
    item.arti ||
    item.translation ||
    "";

  const faedah =
    item.faedah ||
    item.pelajaran ||
    item.kandungan ||
    item.keterangan ||
    "";

  const sumber =
    item.sumber ||
    item.source ||
    item.referensi ||
    "";

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

function buildOneKitab(kitab) {
  const kitabId = kitab.id;
  const status = kitab.status || "";

  if (status !== "tersedia") {
    console.log(`Lewati ${kitabId}: status bukan tersedia`);
    return;
  }

  const folder = getFolderFromKitab(kitab);
  const kitabDir = path.join(DATA_DIR, folder);

  if (!fs.existsSync(kitabDir)) {
    console.log(`Lewati ${kitabId}: folder tidak ditemukan -> data/${folder}`);
    return;
  }

  const files = fs
    .readdirSync(kitabDir)
    .filter(file => /^\d{3}\.json$/.test(file))
    .sort();

  if (files.length === 0) {
    console.log(`Lewati ${kitabId}: tidak ada file 001.json, 002.json, dst di data/${folder}`);
    return;
  }

  const result = [];

  for (const file of files) {
    const filePath = path.join(kitabDir, file);
    const babId = file.replace(".json", "");

    try {
      const json = readJson(filePath);
      const haditsArray = extractHaditsArray(json);

      if (!Array.isArray(haditsArray) || haditsArray.length === 0) {
        console.log(`Kosong: data/${folder}/${file}`);
        continue;
      }

      haditsArray.forEach((item, index) => {
        result.push(normalizeItem(item, kitabId, babId, index));
      });

      console.log(`OK: data/${folder}/${file} -> ${haditsArray.length} item`);
    } catch (err) {
      console.log(`Error: data/${folder}/${file} -> ${err.message}`);
    }
  }

  const outputPath = path.join(kitabDir, "search-index.json");
  writeJson(outputPath, result);

  console.log(`SELESAI: ${kitabId} -> ${result.length} item`);
  console.log(`Output: data/${folder}/search-index.json`);
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
