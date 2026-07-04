const fs = require("fs");
const path = require("path");

const SOURCE_URL =
  "https://raw.githubusercontent.com/irsyadulibad/hadits-database/main/shahih-muslim.sql";

const OUT_DIR = path.join(__dirname, "..", "data", "shahih-muslim");

const KITAB_ID = "shahih-muslim";
const KITAB_NAMA = "Shahih Muslim";
const CHUNK_SIZE = 100;

function pad(num) {
  return String(num).padStart(3, "0");
}

function cleanText(text) {
  if (text === null || text === undefined) return "";

  return String(text)
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSqlTuple(row) {
  const result = [];
  let current = "";
  let inString = false;
  let escape = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === "\\") {
      current += char;
      escape = true;
      continue;
    }

    if (char === "'") {
      inString = !inString;
      current += char;
      continue;
    }

    if (char === "," && !inString) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function parseSqlValue(value) {
  if (!value || value.toUpperCase() === "NULL") return "";

  let text = value.trim();

  if (text.startsWith("'") && text.endsWith("'")) {
    text = text.slice(1, -1);
  }

  return cleanText(text);
}

function extractRows(sql) {
  const rows = [];

  const insertRegex =
    /INSERT INTO\s+`?[^`(\s]+`?\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);/gi;

  let match;

  while ((match = insertRegex.exec(sql)) !== null) {
    const columns = match[1]
      .split(",")
      .map((col) => col.replace(/`/g, "").trim());

    const valuesBlock = match[2];

    const tupleRegex = /\(([\s\S]*?)\)(?:,|$)/g;
    let tupleMatch;

    while ((tupleMatch = tupleRegex.exec(valuesBlock)) !== null) {
      const rawValues = splitSqlTuple(tupleMatch[1]);
      const item = {};

      columns.forEach((col, index) => {
        item[col] = parseSqlValue(rawValues[index]);
      });

      rows.push(item);
    }
  }

  return rows;
}

function normalizeHadith(row, index) {
  const idAsli = Number(row.id || index + 1);
  const noUrut = index + 1;

  return {
    id: noUrut,
    idAsli: idAsli,
    no: noUrut,
    judul: `Hadits Shahih Muslim No. ${noUrut}`,
    arab: cleanText(row.arab || row.arabic || ""),
    latin: "",
    terjemahan: cleanText(
      row.terjemah ||
      row.terjemahan ||
      row.indo ||
      row.indonesia ||
      ""
    ),
    sumber: KITAB_NAMA
  };
}

function chunkArray(array, size) {
  const chunks = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

async function main() {
  console.log("Mengambil file Shahih Muslim SQL...");

  const response = await fetch(SOURCE_URL);

  if (!response.ok) {
    throw new Error(`Gagal download SQL. Status: ${response.status}`);
  }

  const sql = await response.text();

  console.log("Mengekstrak data SQL...");
  const rows = extractRows(sql);

  if (!rows.length) {
    throw new Error("Tidak ada data yang berhasil diekstrak dari SQL.");
  }

  const hadits = rows
    .map(normalizeHadith)
    .filter((item) => item.arab || item.terjemahan);

  const chunks = chunkArray(hadits, CHUNK_SIZE);

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const daftarBab = chunks.map((items, index) => {
    const nomorBagian = index + 1;
    const file = `${pad(nomorBagian)}.json`;
    const awal = items[0]?.no;
    const akhir = items[items.length - 1]?.no;

    fs.writeFileSync(
      path.join(OUT_DIR, file),
      JSON.stringify(items, null, 2),
      "utf8"
    );

    return {
      id: nomorBagian,
      kitab: KITAB_ID,
      nama: `Bagian ${nomorBagian}: Hadits ${awal}–${akhir}`,
      file,
      jumlah: items.length
    };
  });

  fs.writeFileSync(
    path.join(OUT_DIR, "daftar-bab.json"),
    JSON.stringify(daftarBab, null, 2),
    "utf8"
  );

  const info = {
    id: KITAB_ID,
    nama: KITAB_NAMA,
    arab: "صحيح مسلم",
    penulis: "Imam Muslim bin al-Hajjaj",
    jumlah: hadits.length,
    pembagian: `Per ${CHUNK_SIZE} hadits`,
    sumber: "https://github.com/irsyadulibad/hadits-database",
    catatan:
      "File SQL sumber tidak menyediakan data bab asli, sehingga data dibagi berdasarkan rentang nomor hadits."
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "info.json"),
    JSON.stringify(info, null, 2),
    "utf8"
  );

  console.log("Selesai.");
  console.log(`Total hadits: ${hadits.length}`);
  console.log(`Total bagian: ${daftarBab.length}`);
  console.log(`Output: data/shahih-muslim/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
