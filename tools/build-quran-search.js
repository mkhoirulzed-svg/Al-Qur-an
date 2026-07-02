const fs = require("fs");
const path = require("path");

async function buildQuranSearch() {
  const result = [];

  for (let no = 1; no <= 114; no++) {
    console.log(`Mengambil surah ${no}...`);

    const res = await fetch(`https://equran.id/api/v2/surat/${no}`);

    if (!res.ok) {
      throw new Error(`Gagal mengambil surah ${no}`);
    }

    const json = await res.json();
    const surah = json.data;

    surah.ayat.forEach(a => {
      result.push({
        surah: surah.nomor,
        ayat: a.nomorAyat,
        nama: surah.namaLatin,
        artiSurah: surah.arti,
        arab: a.teksArab,
        latin: a.teksLatin,
        terjemahan: a.teksIndonesia
      });
    });
  }

  const outputPath = path.join(__dirname, "..", "data", "quran-search.json");

  fs.writeFileSync(
    outputPath,
    JSON.stringify(result, null, 2),
    "utf8"
  );

  console.log("Selesai.");
  console.log(`Total ayat: ${result.length}`);
  console.log(`File dibuat di: ${outputPath}`);
}

buildQuranSearch().catch(err => {
  console.error("Terjadi error:", err.message);
});
