import { sb, h, clear, initChrome, fetchFuelPrice, priceText, frDateTime, eur } from "./core.js";

await initChrome("tarifs");
const app = document.getElementById("app");
const box = h("div", {});
const rules = h("div", {});
app.replaceChildren(
  h("h1", {}, "Tarifs"),
  h("p", { class: "lead muted" }, "Le prix du gazole vient directement du serveur de jeu. Il ne peut pas être modifié depuis ce site."),
  box,
  h("h2", { style: "margin-top:2.5rem" }, "Publicité sur les panneaux"), rules);

async function load() {
  try {
    const f = await fetchFuelPrice();
    clear(box);
    if (!f) {
      box.append(h("div", { class: "notice warn" }, h("b", {}, "Tarif temporairement indisponible."),
        h("p", { style: "margin:.3rem 0 0" }, "Aucune synchronisation n'a encore eu lieu. Le prix apparaîtra ici automatiquement.")));
    } else {
      box.append(h("div", { class: "kpis" },
        h("div", { class: "kpi" }, "Gazole", h("b", {}, `${priceText(f.price)} €`)),
        h("div", { class: "kpi" }, "Dernière synchronisation", h("b", { style: "font-size:1.3rem" }, frDateTime(f.synced_at)))));
      if (f.is_stale) box.append(h("div", { class: "notice warn" }, "Ce prix n'a pas été actualisé récemment : il peut avoir changé en jeu."));
    }
  } catch { clear(box).append(h("div", { class: "notice err" }, "Impossible de joindre le serveur pour l'instant.")); }
}
load(); setInterval(load, 60_000);

(async () => {
  const [{ data: cfg }, { data: panels }] = await Promise.all([
    sb.from("server_configuration").select("key, value").in("key", ["discount_min_days", "discount_percent", "payment_instructions"]),
    sb.from("panels").select("name, daily_price, width_px, height_px").eq("is_active", true).order("sort_order"),
  ]);
  const c = Object.fromEntries((cfg ?? []).map((r) => [r.key, r.value]));
  clear(rules).append(
    h("p", {}, `De 1 à ${Number(c.discount_min_days ?? 7) - 1} jours : tarif normal. À partir de ${c.discount_min_days ?? 7} jours : ${c.discount_percent ?? 20} % de réduction sur toute la réservation.`),
    h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", {}, "Panneau"), h("th", {}, "Dimensions de l'image"), h("th", {}, "Prix par jour"))),
      h("tbody", {}, (panels ?? []).map((p) => h("tr", {}, h("td", {}, p.name), h("td", {}, `${p.width_px} × ${p.height_px} px`), h("td", {}, eur(p.daily_price))))))),
    h("p", { class: "notice" }, c.payment_instructions ?? "Le paiement se fait uniquement en argent RP, en jeu, auprès de la direction."));
})();
