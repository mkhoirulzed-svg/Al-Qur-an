const fs = require("fs");
const path = require("path");

const SOURCE_URL =
  "https://raw.githubusercontent.com/irsyadulibad/hadits-database/main/shahih-bukhari.sql";

const OUT_DIR = path.join(__dirname, "..", "data", "shahih-bukhari");

const KITAB_ID = "shahih-bukhari";
const KITAB_NAMA = "Shahih Bukhari";
const CHUNK_SIZE = 100; // Ubah nilai ini untuk chunk size berbeda

const CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // ms
  TIMEOUT: 30000, // ms
  VERBOSE: true
};

function pad(num) {
  return String(num).padStart(3, "0");
}

function log(message) {
  if (CONFIG.VERBOSE) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }
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

function parseSqlValue(value) {
  if (!value || value.toUpperCase() === "NULL") return "";

  let text = value.trim();

  if (text.startsWith("'") && text.endsWith("'")) {
    text = text.slice(1, -1);
  }

  return cleanText(text);
}

/**
 * Parses one VALUES(...),(...),(...); block starting at the index of the
 * first opening parenthesis. This is a linear character-by-character scan —
 * NOT regex-based — so it cannot suffer catastrophic backtracking regardless
 * of how large or irregular the input is.
 */
function parseValuesBlock(text, startIndex) {
  const tuples = [];
  let i = startIndex;
  const n = text.length;

  while (i < n) {
    // skip whitespace/commas between tuples
    while (i < n && (text[i] === "," || /\s/.test(text[i]))) i++;
    if (i >= n || text[i] === ";") break;
    if (text[i] !== "(") break;

    i++; // skip opening '('
    const values = [];
    let current = "";
    let inString = false;

    while (i < n) {
      const ch = text[i];

      if (inString) {
        if (ch === "\\" && i + 1 < n) {
          // keep escape sequence as-is; cleanText handles it later
          current += ch + text[i + 1];
          i += 2;
          continue;
        }
        if (ch === "'") {
          inString = false;
          current += ch;
          i++;
          continue;
        }
        current += ch;
        i++;
        continue;
      }

      if (ch === "'") {
        inString = true;
        current += ch;
        i++;
        continue;
      }
      if (ch === ",") {
        values.push(current.trim());
        current = "";
        i++;
        continue;
      }
      if (ch === ")") {
        values.push(current.trim());
        current = "";
        i++;
        break;
      }

      current += ch;
      i++;
    }

    tuples.push(values);
  }

  return { tuples, endIndex: i };
}

function extractRows(sql) {
  const rows = [];
  const insertMarker = "INSERT INTO";
  let searchFrom = 0;

  while (true) {
    const insertIdx = sql.indexOf(insertMarker, searchFrom);
    if (insertIdx === -1) break;

    const valuesIdx = sql.indexOf("VALUES", insertIdx);
    if (valuesIdx === -1) break;

    const colStart = sql.indexOf("(", insertIdx);
    const colEnd = sql.indexOf(")", colStart);

    if (colStart === -1 || colEnd === -1) {
      searchFrom = insertIdx + insertMarker.length;
      continue;
    }

    const columns = sql
      .slice(colStart + 1, colEnd)
      .split(",")
      .map((c) => c.replace(/`/g, "").trim());

    const tupleStart = sql.indexOf("(", valuesIdx);
    if (tupleStart === -1) {
      searchFrom = valuesIdx + 6;
      continue;
    }

    const { tuples, endIndex } = parseValuesBlock(sql, tupleStart);

    for (const tupleValues of tuples) {
      const item = {};
      columns.forEach((col, idx) => {
        item[col] = parseSqlValue(tupleValues[idx]);
      });
      rows.push(item);
    }

    searchFrom = endIndex;
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
    judul: `Hadits Shahih Bukhari No. ${noUrut}`,
    arab: cleanText(row.arab || ""),
    latin: "",
    terjemahan: cleanText(row.terjemah || row.terjemahan || ""),
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

async function fetchWithRetry(url, retries = CONFIG.MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        return response;
      }

      if (i < retries - 1) {
        log(`⚠️  Retry ${i + 1}/${retries - 1} (Status: ${response.status})`);
        await new Promise((resolve) =>
          setTimeout(resolve, CONFIG.RETRY_DELAY * (i + 1))
        );
      }
    } catch (error) {
      if (i < retries - 1) {
        log(`⚠️  Network error, retry ${i + 1}/${retries - 1}: ${error.message}`);
        await new Promise((resolve) =>
          setTimeout(resolve, CONFIG.RETRY_DELAY * (i + 1))
        );
      } else {
        throw error;
      }
    }
  }

  throw new Error(`Failed after ${retries} attempts`);
}

async function main() {
  console.log("=".repeat(60));
  console.log("📚 HADITS DATABASE FETCHER");
  console.log("=".repeat(60));

  log(`📥 Mengambil file Shahih Bukhari dari: ${SOURCE_URL}`);

  let response;
  try {
    response = await fetchWithRetry(SOURCE_URL);
  } catch (error) {
    console.error(`❌ Gagal download SQL: ${error.message}`);
    process.exit(1);
  }

  log(`✅ Download berhasil (Status: ${response.status})`);

  let sql;
  try {
    sql = await response.text();
    log(`📊 Ukuran SQL: ${(sql.length / 1024 / 1024).toFixed(2)} MB`);
  } catch (error) {
    console.error(`❌ Gagal membaca response: ${error.message}`);
    process.exit(1);
  }

  log("🔍 Mengekstrak data dari SQL (linear scan, no regex backtracking)...");
  const t0 = Date.now();
  const rows = extractRows(sql);
  log(`⏱️  Parsing selesai dalam ${Date.now() - t0}ms`);

  if (!rows.length) {
    console.error("❌ Tidak ada data yang berhasil diekstrak dari SQL.");
    process.exit(1);
  }

  log(`✅ Total baris raw dari SQL: ${rows.length}`);

  log("🔄 Normalizing hadith data...");
  const hadits = rows
    .map(normalizeHadith)
    .filter((item) => item.arab || item.terjemahan)
    .sort((a, b) => a.id - b.id);

  log(`✅ Total hadith valid: ${hadits.length}`);

  const chunks = chunkArray(hadits, CHUNK_SIZE);
  log(`📦 Dibagi menjadi ${chunks.length} bagian (${CHUNK_SIZE} hadith/bagian)`);

  log("💾 Menghapus folder output lama...");
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  log("📝 Menulis file JSON...");
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
    arab: "صحيح البخاري",
    penulis: "Imam Muhammad bin Ismail al-Bukhari",
    jumlah: hadits.length,
    pembagian: `Per ${CHUNK_SIZE} hadits`,
    totalBagian: daftarBab.length,
    sumber: "https://github.com/irsyadulibad/hadits-database",
    catatan:
      "File SQL sumber tidak menyediakan data bab asli, sehingga data dibagi berdasarkan rentang nomor hadits.",
    dibuatTanggal: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "info.json"),
    JSON.stringify(info, null, 2),
    "utf8"
  );

  console.log("\n" + "=".repeat(60));
  console.log("✨ SELESAI");
  console.log("=".repeat(60));
  console.log(`📊 Total hadith: ${hadits.length}`);
  console.log(`📦 Total bagian: ${daftarBab.length}`);
  console.log(`📁 Output folder: ${OUT_DIR}`);
  console.log("=".repeat(60) + "\n");
}

main().catch((error) => {
  console.error(`\n❌ FATAL ERROR: ${error.message}`);
  if (CONFIG.VERBOSE) {
    console.error(error.stack);
  }
  process.exit(1);
});
