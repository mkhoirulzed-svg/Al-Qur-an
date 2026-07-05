const fs = require("fs");
const path = require("path");

const SOURCE_URL =
  "https://raw.githubusercontent.com/irsyadulibad/hadits-database/main/shahih-bukhari.sql";

const OUT_DIR = path.join(__dirname, "..", "data", "shahih-bukhari");

const KITAB_ID = "shahih-bukhari";
const KITAB_NAMA = "Shahih Bukhari";
const CHUNK_SIZE = 100; // Ubah nilai ini untuk chunk size berbeda

// Konfigurasi untuk optimasi
const CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // ms
  TIMEOUT: 30000, // ms
  VERBOSE: true // Set ke false untuk output lebih ringkas
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

function extractRowsImproved(sql) {
  const rows = [];
  let parseErrors = 0;

  // Regex yang lebih robust untuk extract INSERT statements
  const insertRegex =
    /INSERT INTO\s+`?[^`(\s]+`?\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?)(?=INSERT INTO|;[\s]*$)/gi;

  let match;

  while ((match = insertRegex.exec(sql)) !== null) {
    try {
      const columns = match[1]
        .split(",")
        .map((col) => col.replace(/`/g, "").trim());

      const valuesBlock = match[2];

      // Lebih robust tuple parsing
      const tupleRegex = /\(([^)]*(?:'[^']*'[^)]*)*)\)(?:,|$)/g;
      let tupleMatch;

      while ((tupleMatch = tupleRegex.exec(valuesBlock)) !== null) {
        try {
          const rawValues = splitSqlTuple(tupleMatch[1]);
          const item = {};

          columns.forEach((col, index) => {
            item[col] = parseSqlValue(rawValues[index] || "");
          });

          // Validasi minimal: harus ada arab atau terjemahan
          if (item.arab || item.terjemah || item.terjemahan) {
            rows.push(item);
          }
        } catch (e) {
          parseErrors++;
          if (CONFIG.VERBOSE) {
            console.warn(`⚠️  Error parsing tuple: ${e.message}`);
          }
        }
      }
    } catch (e) {
      parseErrors++;
      if (CONFIG.VERBOSE) {
        console.warn(`⚠️  Error parsing INSERT block: ${e.message}`);
      }
    }
  }

  if (parseErrors > 0) {
    log(`⚠️  Total parse errors: ${parseErrors} (ignored)`);
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
    latin: cleanText(row.latin || ""),
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
  console.log("📚 HADITS DATABASE FETCHER - OPTIMIZED");
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

  log("🔍 Mengekstrak data dari SQL...");
  const rows = extractRowsImproved(sql);

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

    if ((nomorBagian - 1) % 10 === 0 || nomorBagian === chunks.length) {
      log(`  ✓ Menulis bagian ${nomorBagian}/${chunks.length}`);
    }

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
  log("✅ daftar-bab.json berhasil ditulis");

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
  log("✅ info.json berhasil ditulis");

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
