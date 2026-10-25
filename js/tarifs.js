import { sb, h, clear, initChrome, eur } from "./core.js";

await initChrome("tarifs");
const app = document.getElementById("app");
const rules = h("div", {});
app.replaceChildren(
  h("h1", {}, "Tarifs"),
  h("p", { class: "lead muted" }, "Prix de la publicité sur les panneaux d'Exo Station, par jour de réservation."),
  rules);

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
