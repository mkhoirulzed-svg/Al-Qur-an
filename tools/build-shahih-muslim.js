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
  if (value === undefined || value === null) return "";

  let text = String(value).trim();

  if (!text || text.toUpperCase() === "NULL") return "";

  if (text.startsWith("'") && text.endsWith("'")) {
    text = text.slice(1, -1);
  }

  return cleanText(text);
}

/*
  Fungsi ini menggantikan tupleRegex lama:
  /\(([\s\S]*?)\)(?:,|$)/g

  Kenapa?
  Karena isi hadits bisa mengandung tanda kurung, koma,
  petik, atau karakter escape. Kalau pakai regex sederhana,
  sebagian row bisa terpotong dan data tidak terbaca semua.
*/
function extractTuples(valuesBlock) {
  const tuples = [];

  let current = "";
  let inString = false;
  let escape = false;
  let depth = 0;
  let collecting = false;

  for (let i = 0; i < valuesBlock.length; i++) {
    const char = valuesBlock[i];

    if (escape) {
      if (collecting) current += char;
      escape = false;
      continue;
    }

    if (char === "\\") {
      if (collecting) current += char;
      escape = true;
      continue;
    }

    if (char === "'") {
      inString = !inString;
      if (collecting) current += char;
      continue;
    }

    if (!inString && char === "(") {
      if (depth === 0) {
        collecting = true;
        current = "";
      } else if (collecting) {
        current += char;
      }

      depth++;
      continue;
    }

    if (!inString && char === ")") {
      depth--;

      if (depth === 0 && collecting) {
        tuples.push(current.trim());
        collecting = false;
        current = "";
      } else if (collecting) {
        current += char;
      }

      continue;
    }

    if (collecting) {
      current += char;
    }
  }

  return tuples;
}

function extractRows(sql) {
  const rows = [];

  const insertRegex =
    /INSERT INTO\s+`?([^`(\s]+)`?\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);/gi;

  let match;

  while ((match = insertRegex.exec(sql)) !== null) {
    const tableName = match[1];

    // Supaya aman kalau SQL berisi tabel tambahan.
    if (!tableName.toLowerCase().includes("muslim")) {
      continue;
    }

    const columns = match[2]
      .split(",")
      .map((col) => col.replace(/`/g, "").trim());

    const valuesBlock = match[3];
    const tuples = extractTuples(valuesBlock);

    for (const tuple of tuples) {
      const rawValues = splitSqlTuple(tuple);

      if (rawValues.length !== columns.length) {
        console.warn(
          `Lewati row karena jumlah kolom tidak cocok. Kolom: ${columns.length}, Value: ${rawValues.length}`
        );
        continue;
      }

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

  console.log(`Total row SQL terbaca: ${rows.length}`);

  if (!rows.length) {
    throw new Error("Tidak ada data yang berhasil diekstrak dari SQL.");
  }

  const hadits = rows
    .map(normalizeHadith)
    .filter((item) => item.arab || item.terjemahan);

  console.log(`Total hadits valid: ${hadits.length}`);

  if (!hadits.length) {
    throw new Error("Data SQL terbaca, tapi tidak ada hadits valid.");
  }

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
  console.log("Output: data/shahih-muslim/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
