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
