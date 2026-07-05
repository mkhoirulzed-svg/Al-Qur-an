const fs = require("fs");
const path = require("path");

const INPUT_FILE = path.join(__dirname, "..", "data", "input.json");
const OUTPUT_FILE = path.join(__dirname, "..", "data", "doa-format-baru.json");

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractArrayFromTs(content) {
  const possibleMarkers = [
    "export const dailyDoa",
    "const dailyDoa",
    "dailyDoa: DailyDoaItem[]"
  ];

  let startMarker = -1;

  for (const marker of possibleMarkers) {
    startMarker = content.indexOf(marker);
    if (startMarker !== -1) break;
  }

  if (startMarker === -1) {
    throw new Error("Tidak menemukan data dailyDoa");
  }

  const arrayStart = content.indexOf("[", startMarker);

  if (arrayStart === -1) {
    throw new Error("Tidak menemukan awal array dailyDoa");
  }

  let depth = 0;
  let inString = false;
  let stringChar = "";
  let escaped = false;

  for (let i = arrayStart; i < content.length; i++) {
    const char = content[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === "[") depth++;
    if (char === "]") depth--;

    if (depth === 0) {
      return content.slice(arrayStart, i + 1);
    }
  }

  throw new Error("Tidak menemukan akhir array dailyDoa");
}

function normalizeSumber(item) {
  const perawi = item.perawi || "";
  const derajat = item.derajat || "";

  if (/muttafaq|muttafaqun|bukhari.*muslim|muslim.*bukhari/i.test(perawi + " " + derajat)) {
    return "Muttafaq 'alaih";
  }

  return perawi || derajat || item.sumber || "";
}

function convertItem(item) {
  const id =
    typeof item.id === "string" && item.id.startsWith("doa-")
      ? item.id
      : `doa-${slugify(item.judul || item.id)}`;

  return {
    id,
    judul: item.judul || "",
    arab: item.arab || "",
    latin: item.latin || "",
    arti: item.arti || item.terjemahan || "",
    sumber: normalizeSumber(item)
  };
}

const raw = fs.readFileSync(INPUT_FILE, "utf8");
const data = JSON.parse(raw);

const result = data.map(convertItem);

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), "utf8");

console.log(`Berhasil convert ${result.length} item`);
console.log(`Output: ${OUTPUT_FILE}`);
