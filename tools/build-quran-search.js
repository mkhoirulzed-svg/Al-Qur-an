const fs = require("fs");
const path = require("path");

const SURAH_START_AYAH = [
  1, 8, 294, 494, 670, 790, 956, 1162, 1237, 1366,
  1475, 1598, 1709, 1752, 1851, 1979, 2090, 2201,
  2311, 2409, 2527, 2605, 2723, 2787, 2864, 3091,
  3184, 3272, 3341, 3401, 3435, 3465, 3538, 3592,
  3637, 3720, 3902, 3990, 4065, 4150, 4204, 4257,
  4310, 4399, 4458, 4495, 4530, 4568, 4597, 4615,
  4660, 4709, 4771, 4826, 4904, 5000, 5096, 5125,
  5147, 5171, 5184, 5198, 5209, 5220, 5238, 5250,
  5262, 5292, 5344, 5396, 5440, 5468, 5496, 5516,
  5572, 5612, 5643, 5693, 5733, 5779, 5821, 5850,
  5869, 5905, 5930, 5952, 5969, 5988, 6014, 6044,
  6064, 6079, 6100, 6111, 6119, 6127, 6146, 6151,
  6159, 6167, 6178, 6189, 6197, 6200, 6203, 6208,
  6212, 6219, 6222, 6228, 6231, 6236
];

function getGlobalAyahNumber(surah, ayat) {
  return SURAH_START_AYAH[surah - 1] + ayat - 1;
}

function getAudioUrl(surah, ayat) {
  const globalAyah = getGlobalAyahNumber(Number(surah), Number(ayat));
  return `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${globalAyah}.mp3`;
}

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
        terjemahan: a.teksIndonesia,
        audio: getAudioUrl(surah.nomor, a.nomorAyat)
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
