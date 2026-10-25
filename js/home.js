import { sb, h, clear, initChrome, fetchFuelPrice, priceText, frDateTime, panelPhotoUrl, eur, toast, friendly } from "./core.js";
import { LOGO_SRC } from "./config.js";

await initChrome("accueil");
const app = document.getElementById("app");

/** Totem de prix : l'objet le plus reconnaissable d'une station-service. */
export function totem() {
  const price = h("div", { class: "totem-price off" }, "Chargement…");
  const foot = h("div", { class: "totem-foot", "aria-live": "polite" }, "");
  const logo = h("img", { src: LOGO_SRC, alt: "" });
  logo.addEventListener("error", () => logo.remove());
  const node = h("div", { class: "totem", role: "group", "aria-label": "Prix du gazole" },
    h("div", { class: "totem-head" }, logo, h("b", {}, "EXO STATION")),
    h("div", { class: "totem-row" }, h("span", { class: "totem-name" }, "Gazole"), price),
    foot);
  async function refresh() {
    try {
      const f = await fetchFuelPrice();
      if (!f) {
        price.className = "totem-price off"; price.textContent = "Tarif temporairement indisponible";
        foot.className = "totem-foot"; foot.textContent = "Le prix s'affichera dès la prochaine synchronisation avec le serveur.";
      } else {
        price.className = "totem-price"; clear(price).append(priceText(f.price), h("small", {}, "€"));
        foot.className = `totem-foot ${f.is_stale ? "stale" : ""}`;
        foot.textContent = `Synchronisé le ${frDateTime(f.synced_at)}` + (f.is_stale ? " — cette donnée n'a pas été mise à jour récemment." : "");
      }
    } catch (e) {
      price.className = "totem-price off"; price.textContent = "Tarif temporairement indisponible";
      foot.className = "totem-foot"; foot.textContent = "Impossible de joindre le serveur pour l'instant.";
    }
  }
  refresh();
  setInterval(refresh, 60_000);
  return node;
}

const annBox = h("div", {}, h("p", { class: "muted" }, "Chargement des annonces…"));
const teaser = h("div", { class: "grid" });

app.replaceChildren(
  h("section", { class: "hero" },
    h("div", {},
      h("h1", {}, "Faites le plein à Belle Roche. Affichez-vous sur nos routes."),
      h("p", { class: "lead" }, "Exo Station est la station-service d'Amboise. Retrouvez ici le prix du gazole en direct et réservez un panneau publicitaire en quelques clics."),
      h("div", { class: "actions" },
        h("a", { class: "btn btn-primary", href: "panneaux.html" }, "Réserver un panneau"),
        h("a", { class: "btn btn-ghost", href: "compte.html" }, "Se connecter"))),
    totem()),
  h("section", {}, h("h2", {}, "Panneaux à réserver"), teaser,
    h("p", {}, h("a", { href: "panneaux.html" }, "Voir tous les panneaux et leurs disponibilités"))),
  h("section", { style: "margin-top:2.5rem" }, h("h2", {}, "Dernières annonces"), annBox),
);

(async () => {
  const [{ data: panels }, { data: ann, error }] = await Promise.all([
    sb.from("panels").select("id, name, location, width_px, height_px, daily_price, photo_path").eq("is_active", true).order("sort_order").limit(3),
    sb.from("announcements").select("id, title, body, published_at").eq("is_published", true).order("published_at", { ascending: false }).limit(5),
  ]);
  clear(teaser);
  if (!panels?.length) teaser.append(h("p", { class: "muted" }, "Aucun panneau n'est proposé pour le moment."));
  for (const p of panels ?? []) {
    const url = panelPhotoUrl(p.photo_path);
    teaser.append(h("article", { class: "panel-card" },
      url ? h("img", { class: "panel-photo", src: url, alt: `Photo du panneau ${p.name}`, loading: "lazy" }) : h("div", { class: "panel-photo" }, "Photo à venir"),
      h("div", { class: "panel-body" }, h("h3", {}, p.name),
        h("p", { class: "muted small", style: "margin:0" }, p.location || ""),
        h("div", { class: "price-line" }, eur(p.daily_price), " ", h("small", {}, "par jour")))));
  }
  clear(annBox);
  if (error) annBox.append(h("p", { class: "notice err" }, friendly(error)));
  else if (!ann?.length) annBox.append(h("p", { class: "muted" }, "Aucune annonce pour le moment."));
  for (const a of ann ?? []) annBox.append(h("article", { class: "announce" }, h("h3", {}, a.title),
    h("time", { datetime: a.published_at }, frDateTime(a.published_at)), a.body ? h("p", {}, a.body) : null));
})().catch((e) => toast(friendly(e), "err"));
