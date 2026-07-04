const fs = require("fs");
const path = require("path");

const SOURCE_URL =
  "https://raw.githubusercontent.com/irsyadulibad/hadits-database/refs/heads/main/riyadhus-shalihin.sql";

const OUT_DIR = path.join(__dirname, "..", "data", "riyadhus");

function cleanSqlString(text) {
  if (!text) return "";

  return text
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\")
    .trim();
}

function cleanHtml(text) {
  return text
    .replace(/<p[^>]*>\s*<\/p>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();
}

function pad(num) {
  return String(num).padStart(3, "0");
}

function extractInsertValues(sql) {
  const marker = /INSERT INTO\s+`riyadhus_shalihin`\s+\(`id`,\s*`kitab`,\s*`arab`,\s*`terjemah`\)\s+VALUES/i;
  const match = marker.exec(sql);

  if (!match) {
    throw new Error("Blok INSERT INTO riyadhus_shalihin tidak ditemukan.");
  }

  const start = match.index + match[0].length;
  const end = sql.indexOf(";", start);

  if (end === -1) {
    throw new Error("Akhir INSERT tidak ditemukan.");
  }

  return sql.slice(start, end);
}

function parseRows(valuesText) {
  const rows = [];

  let current = "";
  let inString = false;
  let escapeNext = false;
  let depth = 0;

  for (let i = 0; i < valuesText.length; i++) {
    const ch = valuesText[i];

    if (escapeNext) {
      current += ch;
      escapeNext = false;
      continue;
    }

    if (inString && ch === "\\") {
      current += ch;
      escapeNext = true;
      continue;
    }

    if (ch === "'") {
      inString = !inString;
      current += ch;
      continue;
    }

    if (!inString) {
      if (ch === "(") {
        depth++;
      }

      if (ch === ")") {
        depth--;
      }
    }

    current += ch;

    if (!inString && depth === 0 && current.trim().startsWith("(") && ch === ")") {
      rows.push(current.trim());
      current = "";
    }
  }

  return rows;
}

function parseFields(rowText) {
  let text = rowText.trim();

  if (text.startsWith("(")) text = text.slice(1);
  if (text.endsWith(")")) text = text.slice(0, -1);

  const fields = [];

  let current = "";
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escapeNext) {
      current += ch;
      escapeNext = false;
      continue;
    }

    if (inString && ch === "\\") {
      current += ch;
      escapeNext = true;
      continue;
    }

    if (ch === "'") {
      inString = !inString;
      continue;
    }

    if (!inString && ch === ",") {
      fields.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  fields.push(current.trim());

  return fields;
}

function extractIndoTitle(terjemahan) {
  const h1 = terjemahan.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

  if (!h1) return null;

  const judul = h1[1]
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    judul,
    fullMatch: h1[0],
  };
}

function extractArabTitle(arab) {
  const match = arab.match(/\d+\s*-\s*باب[^\n\r<]*/);

  if (!match) return null;

  return {
    judulArab: match[0].trim(),
    fullMatch: match[0],
  };
}

async function main() {
  console.log("Mengambil file SQL...");

  const res = await fetch(SOURCE_URL);

  if (!res.ok) {
    throw new Error(`Gagal download SQL. Status: ${res.status}`);
  }

  const sql = await res.text();

  console.log("Ukuran SQL:", sql.length);

  const valuesText = extractInsertValues(sql);
  const rowTexts = parseRows(valuesText);

  console.log("Total row SQL terbaca:", rowTexts.length);

  if (rowTexts.length === 0) {
    throw new Error("Row SQL kosong. Parser gagal membaca VALUES.");
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const daftarBab = [];
  let nomorBab = 0;

  for (const rowText of rowTexts) {
    const fields = parseFields(rowText);

    if (fields.length < 4) {
      console.warn("Field kurang dari 4, dilewati:", fields.length);
      continue;
    }

    const sqlId = Number(fields[0]);
    let arab = cleanSqlString(fields[2]);
    let terjemahan = cleanSqlString(fields[3]);

    const indoTitle = extractIndoTitle(terjemahan);
    const arabTitle = extractArabTitle(arab);

    let judul = "";

    if (indoTitle) {
      judul = indoTitle.judul;
      terjemahan = terjemahan.replace(indoTitle.fullMatch, "").trim();
    } else if (arabTitle) {
      judul = arabTitle.judulArab;
    } else {
      judul = `Bab ${sqlId}`;
    }

    if (arabTitle) {
      arab = arab.replace(arabTitle.fullMatch, "").trim();
    }

    terjemahan = cleanHtml(terjemahan);

    nomorBab++;

    const fileName = `${pad(nomorBab)}.json`;

    const babData = {
      id: nomorBab,
      source_id: sqlId,
      judul,
      arab,
      terjemahan,
    };

    fs.writeFileSync(
      path.join(OUT_DIR, fileName),
      JSON.stringify(babData, null, 2),
      "utf8"
    );

    daftarBab.push({
      id: nomorBab,
      source_id: sqlId,
      judul,
      file: fileName,
    });
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "daftar-bab.json"),
    JSON.stringify(daftarBab, null, 2),
    "utf8"
  );

  console.log("Total bab dibuat:", daftarBab.length);
  console.log("Folder output:", OUT_DIR);
  console.log("Selesai.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
