const fs = require("fs");
const path = require("path");

const SOURCE_URL =
  "https://raw.githubusercontent.com/irsyadulibad/hadits-database/refs/heads/main/riyadhus-shalihin.sql";

const OUT_DIR = path.join(process.cwd(), "data", "riyadhus");

function pad(num) {
  return String(num).padStart(3, "0");
}

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

function decodeHtml(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(text) {
  return decodeHtml(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removeHarakat(text) {
  return text.replace(/[\u064B-\u065F\u0670]/g, "");
}

function findStatementEnd(sql, startIndex) {
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < sql.length; i++) {
    const ch = sql[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (inString && ch === "\\") {
      escapeNext = true;
      continue;
    }

    if (ch === "'") {
      inString = !inString;
      continue;
    }

    if (!inString && ch === ";") {
      return i;
    }
  }

  return -1;
}

function extractAllInsertValues(sql) {
  const marker =
    /INSERT INTO\s+`riyadhus_shalihin`\s+\(`id`,\s*`kitab`,\s*`arab`,\s*`terjemah`\)\s+VALUES/gi;

  const blocks = [];
  let match;

  while ((match = marker.exec(sql)) !== null) {
    const start = match.index + match[0].length;
    const end = findStatementEnd(sql, start);

    if (end === -1) {
      throw new Error("Akhir INSERT tidak ditemukan.");
    }

    blocks.push(sql.slice(start, end));
    marker.lastIndex = end + 1;
  }

  return blocks;
}

function parseRows(valuesText) {
  const rows = [];

  let current = "";
  let inString = false;
  let escapeNext = false;
  let depth = 0;
  let capturing = false;

  for (let i = 0; i < valuesText.length; i++) {
    const ch = valuesText[i];

    if (!capturing) {
      if (ch === "(") {
        capturing = true;
        depth = 1;
        current = "(";
      }
      continue;
    }

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
      if (ch === "(") depth++;
      if (ch === ")") depth--;
    }

    current += ch;

    if (!inString && depth === 0) {
      rows.push(current.trim());
      current = "";
      capturing = false;
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

  const judul = stripHtml(h1[1])
    .replace(/\s+/g, " ")
    .trim();

  return {
    judul,
    fullMatch: h1[0],
  };
}

function extractArabTitle(arab) {
  const match = arab.match(/\d+\s*-\s*(باب|كتاب|كتَاب)[^\n\r<]*/);

  if (!match) return null;

  return {
    judulArab: match[0].trim(),
    fullMatch: match[0],
  };
}

function isArabChapterMarker(afterText) {
  const clean = removeHarakat(afterText.trim());
  return clean.startsWith("باب") || clean.startsWith("كتاب");
}

function splitArabicHadits(arab) {
  arab = arab
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const regex = /(?:^|\n)\s*(\d{1,5})\s*-\s+/g;
  const markers = [];

  let m;

  while ((m = regex.exec(arab)) !== null) {
    const after = arab.slice(regex.lastIndex, regex.lastIndex + 40);

    if (isArabChapterMarker(after)) {
      continue;
    }

    markers.push({
      nomor: Number(m[1]),
      start: m.index,
      contentStart: regex.lastIndex,
    });
  }

  if (markers.length === 0) {
    return {
      pembuka: arab,
      items: [],
    };
  }

  const pembuka = arab.slice(0, markers[0].start).trim();
  const items = [];

  for (let i = 0; i < markers.length; i++) {
    const current = markers[i];
    const next = markers[i + 1];

    const content = arab
      .slice(current.contentStart, next ? next.start : arab.length)
      .trim();

    items.push({
      nomor: current.nomor,
      text: content,
    });
  }

  return {
    pembuka,
    items,
  };
}

function splitIndoHadits(terjemahan) {
  let text = terjemahan
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const regex = /<p[^>]*>\s*(\d{1,5})\.\s+/gi;
  const markers = [];

  let m;

  while ((m = regex.exec(text)) !== null) {
    markers.push({
      nomor: Number(m[1]),
      start: m.index,
      contentStart: regex.lastIndex,
    });
  }

  if (markers.length === 0) {
    return {
      pembuka: stripHtml(text),
      items: [],
    };
  }

  const pembuka = stripHtml(text.slice(0, markers[0].start));
  const items = [];

  for (let i = 0; i < markers.length; i++) {
    const current = markers[i];
    const next = markers[i + 1];

    const content = stripHtml(
      text.slice(current.contentStart, next ? next.start : text.length)
    );

    items.push({
      nomor: current.nomor,
      text: content,
    });
  }

  return {
    pembuka,
    items,
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

  const insertBlocks = extractAllInsertValues(sql);
  console.log("Total blok INSERT:", insertBlocks.length);

  if (insertBlocks.length === 0) {
    throw new Error("Tidak ada INSERT riyadhus_shalihin yang ditemukan.");
  }

  const rowTexts = [];

  for (const block of insertBlocks) {
    rowTexts.push(...parseRows(block));
  }

  console.log("Total row SQL terbaca:", rowTexts.length);

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const daftarBab = [];

  for (let i = 0; i < rowTexts.length; i++) {
    const fields = parseFields(rowTexts[i]);

    if (fields.length < 4) {
      console.warn(`Row ${i + 1} dilewati. Jumlah field: ${fields.length}`);
      continue;
    }

    const sourceId = Number(fields[0]);

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
      judul = sourceId === 1 ? "Pendahuluan" : `Bab ${sourceId}`;
    }

    if (arabTitle) {
      arab = arab.replace(arabTitle.fullMatch, "").trim();
    }

    const arabSplit = splitArabicHadits(arab);
    const indoSplit = splitIndoHadits(terjemahan);

    const max = Math.max(arabSplit.items.length, indoSplit.items.length);

    const hadits = [];

    for (let h = 0; h < max; h++) {
      const a = arabSplit.items[h];
      const t = indoSplit.items[h];

      hadits.push({
        id: h + 1,
        nomor_arab: a ? a.nomor : null,
        nomor_terjemahan: t ? t.nomor : null,
        arab: a ? a.text : "",
        terjemahan: t ? t.text : "",
      });
    }

    const babId = daftarBab.length + 1;
    const fileName = `${pad(babId)}.json`;

    const babData = {
      id: babId,
      source_id: sourceId,
      judul,
      pembuka_arab: arabSplit.pembuka,
      pembuka_terjemahan: indoSplit.pembuka,
      jumlah_hadits: hadits.length,
      hadits,
    };

    fs.writeFileSync(
      path.join(OUT_DIR, fileName),
      JSON.stringify(babData, null, 2),
      "utf8"
    );

    daftarBab.push({
      id: babId,
      source_id: sourceId,
      judul,
      jumlah_hadits: hadits.length,
      file: fileName,
    });
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "daftar-bab.json"),
    JSON.stringify(daftarBab, null, 2),
    "utf8"
  );

  console.log("Total file bab dibuat:", daftarBab.length);
  console.log("Output:", OUT_DIR);
  console.log("Selesai.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
