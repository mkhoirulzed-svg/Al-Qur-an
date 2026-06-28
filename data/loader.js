async function loadFooter(currentPage){

    const isRoot =
        location.pathname.endsWith("index.html") ||
        location.pathname==="/" ||
        location.pathname.endsWith("/");

    const componentPath = isRoot
        ? "./data/footer.html"
        : "../data/footer.html";

    const res = await fetch(componentPath);

    const html = await res.text();

    document.getElementById("footer").innerHTML = html;

    const base = isRoot ? "" : "../";

    const links = {
        home: base + "index.html",
        quran: base + "pages/quran.html",
        bookmark: base + "pages/bookmark.html",
        about: base + "pages/about.html"
    };

    document.querySelectorAll(".nav-item").forEach(item=>{

        const page=item.dataset.page;

        item.href=links[page];

        if(page===currentPage){
            item.classList.add("active");
        }
    });

    const active=document.querySelector(".nav-item.active");

    if(active){

        const index=[...document.querySelectorAll(".nav-item")].indexOf(active);

        document.querySelector(".nav-indicator")
            .style.transform=`translateX(${index*100}%)`;
    }
}
