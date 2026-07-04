const fs = require("fs");
const path = require("path");

const SOURCE_URL =
  "https://raw.githubusercontent.com/irsyadulibad/hadits-database/refs/heads/main/riyadhus-shalihin.sql";

const OUT_DIR = path.join(__dirname, "..", "data");
const OUT_FILE = path.join(OUT_DIR, "riyadhus-shalihin.json");

function unescapeSql(str) {
  return str
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim();
}

function splitRows(valuesText) {
  const rows = [];
  let current = "";
  let inString = false;
  let depth = 0;

  for (let i = 0; i < valuesText.length; i++) {
    const ch = valuesText[i];
    const prev = valuesText[i - 1];

    if (ch === "'" && prev !== "\\") inString = !inString;

    if (!inString) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
    }

    current += ch;

    if (!inString && depth === 0 && ch === ")") {
      rows.push(current.trim());
      current = "";
      while (valuesText[i + 1] === "," || /\s/.test(valuesText[i + 1])) i++;
    }
  }

  return rows;
}

function splitFields(row) {
  row = row.replace(/^\(/, "").replace(/\)$/, "");

  const fields = [];
  let current = "";
  let inString = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    const prev = row[i - 1];

    if (ch === "'" && prev !== "\\") {
      inString = !inString;
      continue;
    }

    if (ch === "," && !inString) {
      fields.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  fields.push(current.trim());
  return fields;
}

function getBabTitle(text) {
  const match = text.match(/(?:^|\n)\s*\d+\s*-\s*(باب[^\n\r]+)/);
  return match ? match[1].trim() : "";
}

async function main() {
  console.log("Mengambil file SQL...");

  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Gagal download SQL: ${res.status}`);

  const sql = await res.text();

  const insertMatch = sql.match(
    /INSERT INTO `riyadhus_shalihin` \(`id`, `kitab`, `arab`, `terjemah`\) VALUES\s*([\s\S]*?);/m
  );

  if (!insertMatch) {
    throw new Error("Data INSERT riyadhus_shalihin tidak ditemukan.");
  }

  const rows = splitRows(insertMatch[1]);

  let currentBab = "Mukadimah";

  const data = rows.map((row) => {
    const [id, kitab, arab, terjemah] = splitFields(row);

    const cleanArab = unescapeSql(arab);
    const cleanTerjemah = unescapeSql(terjemah);

    const foundBab = getBabTitle(cleanArab);
    if (foundBab) currentBab = foundBab;

    return {
      id: Number(id),
      judul_bab: currentBab,
      arab: cleanArab,
      terjemahan: cleanTerjemah
    };
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(data, null, 2), "utf8");

  console.log(`Berhasil membuat ${OUT_FILE}`);
  console.log(`Total data: ${data.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
