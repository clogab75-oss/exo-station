import { sb, h, clear, initChrome, eur2 as eur, qty, openDialog, toast, friendly, run, callFn, shopImageUrl } from "./core.js";

const profile = await initChrome("boutique");
const app = document.getElementById("app");
const grid = h("div", { class: "grid" });
app.replaceChildren(h("h1", {}, "Boutique"),
  h("p", { class: "lead muted" }, "Commande en grande quantité. Le paiement se fait uniquement en argent RP, en jeu, auprès de la direction : ta commande est « à payer » jusqu'à ce que la direction confirme."), grid);

function card(it) {
  const url = shopImageUrl(it.image_path);
  const out = it.stock !== null && it.stock <= 0;
  const order = h("button", { class: "btn btn-primary", type: "button", disabled: out, onclick: () => openOrder(it) }, out ? "Rupture de stock" : "Commander");
  return h("article", { class: "panel-card" },
    url ? h("img", { class: "panel-photo", src: url, alt: it.name, loading: "lazy" }) : h("div", { class: "panel-photo" }, "Photo à venir"),
    h("div", { class: "panel-body" },
      h("h3", {}, it.name),
      it.description ? h("p", { class: "muted", style: "margin:0" }, it.description) : null,
      h("ul", { class: "facts" },
        h("li", {}, `Commande minimale : ${qty(it.min_quantity)} ${it.unit_label}`),
        h("li", {}, it.stock === null ? "Disponible" : out ? "Rupture de stock" : `Stock : ${qty(it.stock)}`)),
      h("div", { class: "price-line" }, eur(it.unit_price), " ", h("small", {}, `par ${it.unit_label}`)),
      order));
}

function openOrder(it) {
  if (!profile) {
    openDialog(it.name, h("div", {}, h("div", { class: "notice warn" }, "Connecte-toi pour commander."),
      h("a", { class: "btn btn-primary", href: "compte.html?next=boutique.html" }, "Se connecter ou créer un compte")));
    return;
  }
  const max = it.stock === null ? 100000 : Math.min(100000, it.stock);
  const input = h("input", { id: "shop-qty", type: "number", min: it.min_quantity, max, step: 1, value: it.min_quantity, inputmode: "numeric" });
  const note = h("textarea", { id: "shop-note", rows: 2, maxlength: 500, placeholder: "Facultatif : précision de livraison, etc." });
  const total = h("div", { class: "shop-total", "aria-live": "polite" });
  const err = h("div", { class: "notice err", hidden: true, role: "alert" });
  const submit = h("button", { class: "btn btn-primary", type: "button" }, "Passer la commande");
  const value = () => Number(input.value);
  const valid = () => Number.isInteger(value()) && value() >= it.min_quantity && value() <= max;
  const refresh = () => {
    err.hidden = true;
    if (valid()) { total.textContent = `Total : ${eur(Math.round(it.unit_price * value() * 100) / 100)}`; submit.disabled = false; }
    else { total.textContent = "Total : —"; submit.disabled = true; err.hidden = false; err.textContent = `Quantité entre ${qty(it.min_quantity)} et ${qty(max)} ${it.unit_label}.`; }
  };
  input.addEventListener("input", refresh);
  const add = (n) => h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { input.value = String(Math.min(max, (valid() ? value() : 0) + n)); refresh(); } }, `+ ${qty(n)}`);
  const body = h("div", {},
    h("p", { class: "muted" }, `${eur(it.unit_price)} par ${it.unit_label} — minimum ${qty(it.min_quantity)}.`),
    h("div", { class: "field" }, h("label", { for: "shop-qty" }, `Quantité (${it.unit_label})`), input,
      h("div", { class: "shop-qty" }, add(10), add(100), add(1000), add(10000))),
    h("div", { class: "field" }, h("label", { for: "shop-note" }, "Message pour la direction"), note),
    total, err);
  const dlg = openDialog(it.name, body, [submit]);
  refresh();
  submit.addEventListener("click", () => run(submit, async () => {
    if (!valid()) return refresh();
    const { data, error } = await sb.rpc("create_shop_order", { p_item: it.id, p_quantity: value(), p_note: note.value });
    if (error) throw error;
    callFn("admin-actions", { action: "flush_notifications" }).catch(() => {});
    clear(body).append(h("div", { class: "notice ok" }, h("b", {}, "Commande enregistrée."),
      h("p", { style: "margin:.4rem 0 0" }, `${qty(data.quantity)} × ${data.item_name} = ${eur(data.total_price)}. Statut : à payer. Va payer ce montant en argent RP, en jeu, auprès de la direction.`)),
      h("p", {}, h("a", { href: "compte.html#commandes" }, "Voir mes commandes")));
    submit.remove();
    toast("Commande enregistrée.", "ok");
    load();
  }));
}

async function load() {
  const { data, error } = await sb.from("shop_items").select("*").eq("is_active", true).order("sort_order").order("name");
  clear(grid);
  if (error) return grid.append(h("div", { class: "notice err" }, friendly(error)));
  if (!data.length) return grid.append(h("p", { class: "muted" }, "Aucun article en vente pour l'instant."));
  grid.append(...data.map(card));
}
load();
