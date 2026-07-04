const fs = require("fs");
const path = require("path");

const SOURCE =
"https://raw.githubusercontent.com/irsyadulibad/hadits-database/refs/heads/main/riyadhus-shalihin.sql";

const OUT_DIR = path.join(__dirname, "..", "data", "riyadhus");

function clean(text){
    return text
        .replace(/\\r\\n/g,"\n")
        .replace(/\\r/g,"\n")
        .replace(/\\\\/g,"\\")
        .replace(/\\'/g,"'")
        .trim();
}

function pad(num){
    return String(num).padStart(3,"0");
}

async function main(){

    console.log("Downloading SQL...");

    const res = await fetch(SOURCE);

    if(!res.ok) throw new Error("Download gagal");

    const sql = await res.text();

    fs.mkdirSync(OUT_DIR,{recursive:true});

    const regex =
/\((\d+),\s*'([^']*)',\s*'([\s\S]*?)',\s*'([\s\S]*?)'\)(?:,|;)/g;

    let match;

    let currentBab = null;
    let daftarBab = [];

    while((match = regex.exec(sql)) !== null){

        const id = Number(match[1]);

        let arab = clean(match[3]);
        let indo = clean(match[4]);

        //---------------------------------------
        // cek apakah awal bab
        //---------------------------------------

        const titleMatch =
            indo.match(/<h1[^>]*>(.*?)<\/h1>/is);

        if(titleMatch){

            if(currentBab){

                const fileName = pad(currentBab.id)+".json";

                fs.writeFileSync(
                    path.join(OUT_DIR,fileName),
                    JSON.stringify(currentBab,null,2),
                    "utf8"
                );

                daftarBab.push({
                    id:currentBab.id,
                    judul:currentBab.judul,
                    jumlah_hadits:currentBab.hadits.length,
                    file:fileName
                });

            }

            const judul = titleMatch[1]
                .replace(/<[^>]+>/g,"")
                .replace(/^Bab\s+/i,"")
                .trim();

            indo = indo.replace(titleMatch[0],"").trim();

            const arabTitle =
                arab.match(/\d+\s*-\s*باب[^\n<]*/);

            if(arabTitle){

                arab = arab.replace(arabTitle[0],"").trim();

            }

            currentBab = {

                id:daftarBab.length+1,

                judul,

                hadits:[]

            };

        }

        if(!currentBab) continue;

        currentBab.hadits.push({

            id,

            arab,

            terjemahan:indo

        });

    }

    //---------------------------------------
    // simpan bab terakhir
    //---------------------------------------

    if(currentBab){

        const fileName = pad(currentBab.id)+".json";

        fs.writeFileSync(
            path.join(OUT_DIR,fileName),
            JSON.stringify(currentBab,null,2),
            "utf8"
        );

        daftarBab.push({

            id:currentBab.id,
            judul:currentBab.judul,
            jumlah_hadits:currentBab.hadits.length,
            file:fileName

        });

    }

    fs.writeFileSync(

        path.join(OUT_DIR,"daftar-bab.json"),

        JSON.stringify(daftarBab,null,2),

        "utf8"

    );

    console.log("Bab :",daftarBab.length);

    console.log("Selesai.");

}

main().catch(console.error);
