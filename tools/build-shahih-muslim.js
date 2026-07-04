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

function hasArabic(text) {
  return /[\u0600-\u06FF]/.test(String(text || ""));
}

function normalizeColumnName(name) {
  return String(name || "")
    .replace(/`/g, "")
    .trim()
    .toLowerCase();
}

/*
  Membaca semua statement INSERT secara aman.
  Tidak pakai regex sampai ; biasa, karena ; bisa saja muncul di dalam teks.
*/
function extractInsertStatements(sql) {
  const statements = [];

  let i = 0;

  while (i < sql.length) {
    const insertIndex = sql.toUpperCase().indexOf("INSERT INTO", i);

    if (insertIndex === -1) break;

    let current = "";
    let inString = false;
    let escape = false;

    for (let j = insertIndex; j < sql.length; j++) {
      const char = sql[j];
      const next = sql[j + 1];

      current += char;

      if (escape) {
        escape = false;
        continue;
      }

      if (char === "\\") {
        escape = true;
        continue;
      }

      // Handle petik SQL model dua petik: ''
      if (char === "'" && inString && next === "'") {
        current += next;
        j++;
        continue;
      }

      if (char === "'") {
        inString = !inString;
        continue;
      }

      if (char === ";" && !inString) {
        statements.push(current.trim());
        i = j + 1;
        break;
      }

      if (j === sql.length - 1) {
        i = sql.length;
      }
    }
  }

  return statements;
}

/*
  Memecah nilai tuple:
  (1,'arab','terjemah'),(2,'arab','terjemah')
  menjadi array isi masing-masing tuple.
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
    const next = valuesBlock[i + 1];

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

    // Handle petik SQL model dua petik: ''
    if (char === "'" && inString && next === "'") {
      if (collecting) {
        current += char;
        current += next;
      }
      i++;
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

/*
  Memecah isi tuple berdasarkan koma,
  tapi koma di dalam string tidak dihitung.
*/
function splitSqlTuple(row) {
  const result = [];

  let current = "";
  let inString = false;
  let escape = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    const next = row[i + 1];

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

    // Handle petik SQL model dua petik: ''
    if (char === "'" && inString && next === "'") {
      current += char;
      current += next;
      i++;
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

  // Handle escaped quote SQL model dua petik
  text = text.replace(/''/g, "'");

  return cleanText(text);
}

function parseInsertStatement(statement) {
  const headerRegex =
    /INSERT\s+INTO\s+`?([^`\s(]+)`?\s*\(([\s\S]*?)\)\s*VALUES\s*/i;

  const match = statement.match(headerRegex);

  if (!match) {
    return null;
  }

  const tableName = match[1];

  const columns = match[2]
    .split(",")
    .map((col) => normalizeColumnName(col));

  const valuesStartIndex = match[0].length;
  let valuesBlock = statement.slice(valuesStartIndex).trim();

  if (valuesBlock.endsWith(";")) {
    valuesBlock = valuesBlock.slice(0, -1).trim();
  }

  const tuples = extractTuples(valuesBlock);

  return {
    tableName,
    columns,
    tuples
  };
}

function extractRows(sql) {
  const rows = [];
  const tableStats = {};
  const columnSamples = {};

  const insertStatements = extractInsertStatements(sql);

  console.log(`Total INSERT statement terbaca: ${insertStatements.length}`);

  for (const statement of insertStatements) {
    const parsed = parseInsertStatement(statement);

    if (!parsed) continue;

    const { tableName, columns, tuples } = parsed;

    if (!tableStats[tableName]) {
      tableStats[tableName] = 0;
      columnSamples[tableName] = columns;
    }

    tableStats[tableName] += tuples.length;

    for (const tuple of tuples) {
      const rawValues = splitSqlTuple(tuple);

      if (rawValues.length !== columns.length) {
        console.warn(
          `Lewati row: kolom tidak cocok di tabel ${tableName}. Kolom: ${columns.length}, Value: ${rawValues.length}`
        );
        continue;
      }

      const item = {
        _table: tableName
      };

      columns.forEach((col, index) => {
        item[col] = parseSqlValue(rawValues[index]);
      });

      rows.push(item);
    }
  }

  console.log("Statistik tabel:");
  Object.keys(tableStats).forEach((table) => {
    console.log(`- ${table}: ${tableStats[table]} tuple`);
    console.log(`  Kolom: ${columnSamples[table].join(", ")}`);
  });

  return rows;
}

function pickFirst(row, names) {
  for (const name of names) {
    const key = normalizeColumnName(name);
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim()) {
      return row[key];
    }
  }

  return "";
}

function findArabicValue(row) {
  const preferred = pickFirst(row, [
    "arab",
    "arabic",
    "teks_arab",
    "teksArab",
    "hadits_arab",
    "hadis_arab",
    "matan",
    "isi_arab",
    "text_arab",
    "content_arab",
    "hadits",
    "hadis",
    "text"
  ]);

  if (hasArabic(preferred)) {
    return preferred;
  }

  for (const key of Object.keys(row)) {
    if (key.startsWith("_")) continue;

    const value = row[key];

    if (hasArabic(value)) {
      return value;
    }
  }

  return preferred;
}

function findTranslationValue(row) {
  const preferred = pickFirst(row, [
    "terjemah",
    "terjemahan",
    "indo",
    "indonesia",
    "id",
    "teks_indonesia",
    "teksIndonesia",
    "arti",
    "makna",
    "translation",
    "translate",
    "content",
    "isi"
  ]);

  // Jangan jadikan angka ID sebagai terjemahan
  if (/^\d+$/.test(String(preferred).trim())) {
    return "";
  }

  return preferred;
}

function findOriginalId(row, index) {
  const value = pickFirst(row, [
    "id",
    "no",
    "nomor",
    "number",
    "hadits_id",
    "hadis_id"
  ]);

  const number = Number(value);

  if (Number.isFinite(number) && number > 0) {
    return number;
  }

  return index + 1;
}

function normalizeHadith(row, index) {
  const noUrut = index + 1;
  const idAsli = findOriginalId(row, index);

  const arab = cleanText(findArabicValue(row));
  const terjemahan = cleanText(findTranslationValue(row));

  return {
    id: noUrut,
    idAsli,
    no: noUrut,
    judul: `Hadits Shahih Muslim No. ${noUrut}`,
    arab,
    latin: "",
    terjemahan,
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

  console.log(`Ukuran file SQL: ${(sql.length / 1024 / 1024).toFixed(2)} MB`);

  console.log("Mengekstrak data SQL...");

  const rows = extractRows(sql);

  console.log(`Total row mentah terbaca: ${rows.length}`);

  if (!rows.length) {
    throw new Error("Tidak ada data yang berhasil diekstrak dari SQL.");
  }

  const haditsSemua = rows.map(normalizeHadith);

  const hadits = haditsSemua.filter((item) => {
    return item.arab || item.terjemahan;
  });

  console.log(`Total hadits valid: ${hadits.length}`);

  const kosong = haditsSemua.length - hadits.length;

  if (kosong > 0) {
    console.log(`Row kosong / tidak terpakai: ${kosong}`);
  }

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
