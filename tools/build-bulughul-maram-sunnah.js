const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const BASE_URL = "https://sunnah.com";
const COLLECTION_URL = "https://sunnah.com/bulugh";

const OUT_DIR = path.join(__dirname, "..", "data", "bulughul-maram");

const KITAB_ID = "bulughul-maram";
const KITAB_NAMA = "Bulughul Maram";
const PENULIS = "Ibnu Hajar Al-Asqalani";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function pad(num) {
  return String(num).padStart(3, "0");
}

function cleanText(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?،؛])/, "$1")
    .trim();
}

function hasArabic(text) {
  return /[\u0600-\u06FF]/.test(text || "");
}

function countArabicChars(text) {
  const m = String(text || "").match(/[\u0600-\u06FF]/g);
  return m ? m.length : 0;
}

function isGoodArabicHadith(text) {
  const t = cleanText(text);
  if (!hasArabic(t)) return false;
  if (countArabicChars(t) < 20) return false;

  // Hindari judul kitab saja seperti كتاب الطهارة
  if (/^كتاب\s+[\u0600-\u06FF\s]+$/.test(t) && t.length < 60) {
    return false;
  }

  return true;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; BulughulMaramBuilder/1.0; educational use)"
    }
  });

  if (!res.ok) {
    throw new Error(`Gagal fetch ${url}. Status: ${res.status}`);
  }

  return await res.text();
}

function extractBooksFromIndex(html) {
  const $ = cheerio.load(html);
  const books = [];

  $("a[href^='/bulugh/']").each((_, el) => {
    const href = $(el).attr("href");
    const text = cleanText($(el).text());

    const match = href && href.match(/^\/bulugh\/(\d+)$/);
    if (!match) return;

    const bookNo = Number(match[1]);
    if (!bookNo || bookNo < 1 || bookNo > 16) return;

    const arabMatch = text.match(/(كتاب\s+[\u0600-\u06FF\s]+)$/);
    const arabTitle = arabMatch ? cleanText(arabMatch[1]) : "";

    const englishTitle = cleanText(
      text
        .replace(/^\d+\s*/, "")
        .replace(arabTitle, "")
    );

    books.push({
      bookNo,
      id: pad(bookNo),
      url: BASE_URL + href,
      title: englishTitle || `Book ${bookNo}`,
      arabTitle
    });
  });

  const unique = [];
  const seen = new Set();

  for (const book of books) {
    if (seen.has(book.bookNo)) continue;
    seen.add(book.bookNo);
    unique.push(book);
  }

  unique.sort((a, b) => a.bookNo - b.bookNo);
  return unique;
}

function extractHadithLinksFromBook(html, bookNo) {
  const $ = cheerio.load(html);
  const links = [];

  $(`a[href^="/bulugh/${bookNo}/"]`).each((_, el) => {
    const href = $(el).attr("href");
    const match = href && href.match(new RegExp(`^/bulugh/${bookNo}/(\\d+)$`));
    if (!match) return;

    links.push({
      bookNo,
      localNo: Number(match[1]),
      url: BASE_URL + href
    });
  });

  const unique = [];
  const seen = new Set();

  for (const item of links) {
    const key = `${item.bookNo}-${item.localNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  unique.sort((a, b) => a.localNo - b.localNo);
  return unique;
}

function extractHadithFromPage(html, meta) {
  const $ = cheerio.load(html);

  $("script, style, nav, footer, header, aside, form, noscript").remove();

  const allTextLines = $("body")
    .text()
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean);

  const arabicLines = allTextLines.filter(isGoodArabicHadith);

  // Biasanya teks Arab utama adalah baris Arab panjang pertama setelah judul.
  // Catatan kaki Arab kadang ikut muncul; kita ambil yang paling relevan/panjang.
  let arab = "";

  if (arabicLines.length) {
    arab = arabicLines
      .sort((a, b) => countArabicChars(b) - countArabicChars(a))[0];
  }

  const sunnahRefLine = allTextLines.find(line =>
    /^Sunnah\.com reference/i.test(line)
  );

  const arabicRefLine = allTextLines.find(line =>
    /^Arabic reference/i.test(line)
  );

  return {
    bookNo: meta.bookNo,
    localNo: meta.localNo,
    sunnahUrl: meta.url,
    arab,
    statusArab: arab ? "ok" : "arab_tidak_ditemukan",
    sunnahReference: sunnahRefLine || "",
    arabicReference: arabicRefLine || ""
  };
}

async function scrapeSunnah() {
  console.log("Mengambil index:", COLLECTION_URL);
  const indexHtml = await fetchHtml(COLLECTION_URL);
  const books = extractBooksFromIndex(indexHtml);

  if (!books.length) {
    throw new Error("Daftar kitab Sunnah.com tidak ditemukan.");
  }

  console.log(`Jumlah kitab terdeteksi: ${books.length}`);

  const allHadith = [];

  for (const book of books) {
    console.log(`\nKitab ${book.bookNo}: ${book.title}`);

    const bookHtml = await fetchHtml(book.url);
    const links = extractHadithLinksFromBook(bookHtml, book.bookNo);

    console.log(`Hadits link terdeteksi: ${links.length}`);

    for (const link of links) {
      try {
        const html = await fetchHtml(link.url);
        const hadith = extractHadithFromPage(html, link);

        allHadith.push({
          ...hadith,
          bookTitle: book.title,
          bookArabTitle: book.arabTitle
        });

        console.log(
          `OK ${book.bookNo}/${link.localNo} | arab: ${hadith.arab ? "ada" : "kosong"}`
        );
      } catch (err) {
        console.error(`Gagal ${link.url}:`, err.message);

        allHadith.push({
          bookNo: book.bookNo,
          localNo: link.localNo,
          sunnahUrl: link.url,
          bookTitle: book.title,
          bookArabTitle: book.arabTitle,
          arab: "",
          statusArab: "gagal_fetch",
          error: err.message
        });
      }

      // Jeda kecil biar tidak terlalu agresif
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  return { books, allHadith };
}

function writeRawSource({ books, allHadith }) {
  ensureDir(OUT_DIR);

  fs.writeFileSync(
    path.join(OUT_DIR, "sunnah-books.json"),
    JSON.stringify(books, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    path.join(OUT_DIR, "arab-source-sunnah.json"),
    JSON.stringify(allHadith, null, 2),
    "utf8"
  );

  const missing = allHadith.filter(item => !item.arab);

  fs.writeFileSync(
    path.join(OUT_DIR, "missing-arab-sunnah.json"),
    JSON.stringify(missing, null, 2),
    "utf8"
  );

  console.log("\nSumber mentah selesai.");
  console.log(`Total hadits: ${allHadith.length}`);
  console.log(`Arab kosong/gagal: ${missing.length}`);
}

function buildByBook({ books, allHadith }) {
  let globalId = 0;

  const daftarBab = books.map(book => {
    const items = allHadith
      .filter(h => h.bookNo === book.bookNo)
      .sort((a, b) => a.localNo - b.localNo);

    return {
      id: pad(book.bookNo),
      judul: book.title,
      arab: book.arabTitle,
      jumlah: items.length
    };
  });

  fs.writeFileSync(
    path.join(OUT_DIR, "daftar-bab.json"),
    JSON.stringify(daftarBab, null, 2),
    "utf8"
  );

  for (const book of books) {
    const items = allHadith
      .filter(h => h.bookNo === book.bookNo)
      .sort((a, b) => a.localNo - b.localNo)
      .map(h => {
        globalId++;

        return {
          id: globalId,
          nomorDalamBab: h.localNo,
          kitab: KITAB_NAMA,
          kitabId: KITAB_ID,
          babId: pad(book.bookNo),
          bab: book.title,
          arabJudulBab: book.arabTitle,
          arab: h.arab || "",
          latin: "",
          terjemahan: "",
          perawi: "",
          faedah: [],
          statusArab: h.statusArab,
          statusTerjemahan: "perlu_diterjemahkan",
          referensi: {
            sunnahUrl: h.sunnahUrl,
            sunnahReference: h.sunnahReference || "",
            arabicReference: h.arabicReference || ""
          },
          sumber: {
            arab: "Sunnah.com Bulugh al-Maram",
            terjemahan: "Terjemahan mandiri, belum diisi"
          }
        };
      });

    fs.writeFileSync(
      path.join(OUT_DIR, `${pad(book.bookNo)}.json`),
      JSON.stringify(items, null, 2),
      "utf8"
    );
  }

  const meta = {
    kitab: KITAB_NAMA,
    kitabId: KITAB_ID,
    penulis: PENULIS,
    sumberArab: COLLECTION_URL,
    jumlahBab: books.length,
    jumlahHadits: allHadith.length,
    catatan:
      "Data Arab diambil dari sumber pembanding. Terjemahan Indonesia tidak disalin dan perlu dibuat mandiri."
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "meta.json"),
    JSON.stringify(meta, null, 2),
    "utf8"
  );

  console.log("\nOutput aplikasi selesai.");
  console.log(`File daftar bab: data/bulughul-maram/daftar-bab.json`);
  console.log(`File bab: data/bulughul-maram/001.json sampai ${pad(books.length)}.json`);
}

async function main() {
  ensureDir(OUT_DIR);

  const result = await scrapeSunnah();

  writeRawSource(result);
  buildByBook(result);
}

main().catch(err => {
  console.error("Gagal:", err);
  process.exit(1);
});