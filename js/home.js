import { sb, h, clear, initChrome, frDateTime, panelPhotoUrl, eur, toast, friendly } from "./core.js";
import { LOGO_SRC } from "./config.js";

await initChrome("accueil");
const app = document.getElementById("app");

/** Carte d'enseigne (logo) à droite du titre. */
export function totem() {
  const logo = h("img", { src: LOGO_SRC, alt: "Logo Exo Station" });
  logo.addEventListener("error", () => logo.remove());
  return h("div", { class: "totem", role: "group", "aria-label": "Exo Station" },
    h("div", { class: "totem-head" }, logo, h("b", {}, "EXO STATION")),
    h("div", { class: "totem-foot" }, "Station-service de Belle Roche, Amboise"));
}

const annBox = h("div", {}, h("p", { class: "muted" }, "Chargement des annonces…"));
const teaser = h("div", { class: "grid" });

app.replaceChildren(
  h("section", { class: "hero" },
    h("div", {},
      h("h1", {}, "Faites le plein à Belle Roche. Affichez-vous sur nos routes."),
      h("p", { class: "lead" }, "Exo Station est la station-service d'Amboise. Réservez un panneau publicitaire en quelques clics."),
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
