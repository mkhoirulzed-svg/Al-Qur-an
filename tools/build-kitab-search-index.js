const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");

const KITAB_LIST = [
  "bukhari",
  "muslim",
  "riyadhus",
  "bulughul-maram",
  "arbain"
];

function pad(num) {
  return String(num).padStart(3, "0");
}

function cleanText(text) {
  if (text === null || text === undefined) return "";

  return String(text)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHadits(item, kitabId, babId, index) {
  const idHadits =
    item.id ??
    item.nomor ??
    item.no ??
    item.number ??
    index + 1;

  const judul =
    item.judul ||
    item.title ||
    `Hadits ${idHadits}`;

  const arab =
    item.arab ||
    item.arabic ||
    item.teksArab ||
    "";

  const latin =
    item.latin ||
    item.transliterasi ||
    "";

  const terjemahan =
    item.terjemahan ||
    item.terjemah ||
    item.indonesia ||
    item.teksIndonesia ||
    item arti ||
    "";

  const faedah =
    item.faedah ||
    item.keterangan ||
    "";

  const sumber =
    item.sumber ||
    item.source ||
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildSearchIndexForKitab(kitabId) {
  const kitabDir = path.join(DATA_DIR, kitabId);

  if (!fs.existsSync(kitabDir)) {
    console.log(`Lewati ${kitabId}: folder tidak ada`);
    return;
  }

  const files = fs
    .readdirSync(kitabDir)
    .filter(file => /^\d{3}\.json$/.test(file))
    .sort();

  if (files.length === 0) {
    console.log(`Lewati ${kitabId}: tidak ada file 001.json dst`);
    return;
  }

  const result = [];

  for (const file of files) {
    const babId = file.replace(".json", "");
    const filePath = path.join(kitabDir, file);

    try {
      const data = readJson(filePath);

      if (!Array.isArray(data)) {
        console.log(`Lewati ${kitabId}/${file}: format bukan array`);
        continue;
      }

      data.forEach((item, index) => {
        result.push(normalizeHadits(item, kitabId, babId, index));
      });

      console.log(`OK ${kitabId}/${file}: ${data.length} item`);
    } catch (err) {
      console.log(`Gagal membaca ${kitabId}/${file}: ${err.message}`);
    }
  }

  const outputPath = path.join(kitabDir, "search-index.json");

  fs.writeFileSync(
    outputPath,
    JSON.stringify(result, null, 2),
    "utf8"
  );

  console.log(`Selesai ${kitabId}: ${result.length} item -> ${outputPath}`);
}

function main() {
  for (const kitabId of KITAB_LIST) {
    buildSearchIndexForKitab(kitabId);
  }
}

main();
