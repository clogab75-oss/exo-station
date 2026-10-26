import { sb, h, clear, initChrome, eur2 as eur, qty, openDialog, toast, friendly, run, callFn, shopImageUrl } from "./core.js";

const profile = await initChrome("boutique");
const app = document.getElementById("app");

/* ------------------------------------------------------------ remise de quantité (le serveur recalcule toujours) */
const RULE = { step: 5, per: 1, max: 25 };
{
  const { data } = await sb.from("server_configuration").select("key, value").in("key", ["shop_discount_step", "shop_discount_per_step", "shop_discount_max"]);
  const c = Object.fromEntries((data ?? []).map((r) => [r.key, Number(r.value)]));
  if (c.shop_discount_step > 0) RULE.step = c.shop_discount_step;
  if (c.shop_discount_per_step > 0) RULE.per = c.shop_discount_per_step;
  if (c.shop_discount_max > 0) RULE.max = c.shop_discount_max;
}
const discountFor = (n) => Math.min(RULE.max, Math.floor(n / RULE.step) * RULE.per);

/* ------------------------------------------------------------ panier (mémorisé dans ce navigateur, sans donnée sensible) */
const KEY = "exo-cart";
let memory = [];
const readCart = () => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.filter((l) => l && typeof l.id === "string" && Number.isInteger(l.qty) && l.qty > 0) : []; } catch { return memory; } };
const saveCart = (c) => { memory = c; try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* navigation privée : le panier reste en mémoire */ } };
let items = [];
const byId = (id) => items.find((i) => i.id === id);
const cartLines = () => readCart().map((l) => ({ ...l, item: byId(l.id) })).filter((l) => l.item);
function totals(lines) {
  const n = lines.reduce((s, l) => s + l.qty, 0);
  const sub = Math.round(lines.reduce((s, l) => s + l.item.unit_price * l.qty * 100, 0)) / 100;
  const d = discountFor(n);
  return { n, sub, d, total: Math.round(sub * (100 - d)) / 100 };
}
const hint = (n) => {
  const d = discountFor(n);
  if (d >= RULE.max) return `Remise maximale atteinte : -${RULE.max} %.`;
  const next = (Math.floor(n / RULE.step) + 1) * RULE.step - n;
  return `Encore ${qty(next)} article${next > 1 ? "s" : ""} pour passer à -${d + RULE.per} %.`;
};

/* ------------------------------------------------------------ page */
const grid = h("div", { class: "grid" });
const bar = h("div", { class: "notice", style: "display:flex;gap:1rem;align-items:center;justify-content:space-between;flex-wrap:wrap" });
app.replaceChildren(h("h1", {}, "Boutique"),
  h("p", { class: "lead muted" }, "Commande en grande quantité. Le paiement se fait uniquement en argent RP, en jeu, auprès de la direction : ta commande est « à payer » jusqu'à ce que la direction confirme."),
  h("div", { class: "notice ok" }, h("b", {}, `Remise de quantité : -${RULE.per} % tous les ${RULE.step} articles commandés`), ` (tous articles confondus), cumulable jusqu'à -${RULE.max} %, sur toute la commande.`),
  bar, grid);

function paintBar() {
  const lines = cartLines(), t = totals(lines);
  clear(bar);
  if (!lines.length) return bar.append(h("span", {}, "Ton panier est vide."));
  bar.append(h("span", {}, h("b", {}, `Panier : ${qty(t.n)} article${t.n > 1 ? "s" : ""}`), ` — ${eur(t.total)}`, t.d > 0 ? ` (remise -${t.d} %)` : ""),
    h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: openCart }, "Voir le panier et commander"));
}

function card(it) {
  const url = shopImageUrl(it.image_path);
  const out = it.stock !== null && it.stock <= 0;
  return h("article", { class: "panel-card" },
    url ? h("img", { class: "panel-photo shop-photo", src: url, alt: it.name, loading: "lazy" }) : h("div", { class: "panel-photo" }, "Photo à venir"),
    h("div", { class: "panel-body" },
      h("h3", {}, it.name),
      it.description ? h("p", { class: "muted", style: "margin:0" }, it.description) : null,
      h("ul", { class: "facts" },
        h("li", {}, `Commande minimale : ${qty(it.min_quantity)} ${it.unit_label}`),
        h("li", {}, it.stock === null ? "Disponible" : out ? "Rupture de stock" : `Stock : ${qty(it.stock)}`)),
      h("div", { class: "price-line" }, eur(it.unit_price), " ", h("small", {}, `par ${it.unit_label}`)),
      h("button", { class: "btn btn-primary", type: "button", disabled: out, onclick: () => openAdd(it) }, out ? "Rupture de stock" : "Ajouter au panier")));
}

const maxFor = (it) => (it.stock === null ? 100000 : Math.min(100000, it.stock));

function openAdd(it) {
  const inCart = readCart().find((l) => l.id === it.id)?.qty ?? 0;
  const max = maxFor(it) - inCart;
  if (max < Math.max(1, it.min_quantity - inCart)) return toast("Tu as déjà pris tout le stock disponible dans ton panier.", "err");
  const start = Math.max(it.min_quantity - inCart, 1);
  const input = h("input", { id: "shop-qty", type: "number", min: start, max, step: 1, value: start, inputmode: "numeric" });
  const total = h("div", { class: "shop-total", "aria-live": "polite" });
  const err = h("div", { class: "notice err", hidden: true, role: "alert" });
  const submit = h("button", { class: "btn btn-primary", type: "button" }, "Ajouter au panier");
  const value = () => Number(input.value);
  const valid = () => Number.isInteger(value()) && value() >= start && value() <= max;
  const refresh = () => {
    err.hidden = true;
    if (valid()) { total.textContent = `Cette ligne : ${eur(Math.round(it.unit_price * value() * 100) / 100)}`; submit.disabled = false; }
    else { total.textContent = "—"; submit.disabled = true; err.hidden = false; err.textContent = `Quantité entre ${qty(start)} et ${qty(max)} ${it.unit_label}.`; }
  };
  input.addEventListener("input", refresh);
  const add = (n) => h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { input.value = String(Math.min(max, (valid() ? value() : 0) + n)); refresh(); } }, `+ ${qty(n)}`);
  const dlg = openDialog(it.name, h("div", {},
    h("p", { class: "muted" }, `${eur(it.unit_price)} par ${it.unit_label} — minimum ${qty(it.min_quantity)}.${inCart ? ` Déjà ${qty(inCart)} dans ton panier.` : ""}`),
    h("div", { class: "field" }, h("label", { for: "shop-qty" }, `Quantité (${it.unit_label})`), input, h("div", { class: "shop-qty" }, add(5), add(10), add(100), add(1000))),
    total, err), [submit]);
  refresh();
  submit.addEventListener("click", () => {
    if (!valid()) return refresh();
    const cart = readCart(), l = cart.find((x) => x.id === it.id);
    if (l) l.qty += value(); else cart.push({ id: it.id, qty: value() });
    saveCart(cart); paintBar(); dlg.close();
    toast(`${qty(value())} × ${it.name} ajouté${value() > 1 ? "s" : ""} au panier.`, "ok");
  });
}

function openCart() {
  const body = h("div", {});
  const note = h("textarea", { id: "shop-note", rows: 2, maxlength: 500, placeholder: "Facultatif : précision de livraison, etc." });
  const submit = h("button", { class: "btn btn-primary", type: "button" }, "Passer la commande");
  const dlg = openDialog("Mon panier", body, [submit]);
  function paint() {
    const lines = cartLines(), t = totals(lines);
    clear(body);
    if (!lines.length) { submit.hidden = true; return body.append(h("p", {}, "Ton panier est vide.")); }
    submit.hidden = false;
    const bad = lines.some((l) => l.qty < l.item.min_quantity || l.qty > maxFor(l.item));
    submit.disabled = bad;
    body.append(
      h("div", { class: "table-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, ["Article", "Prix", "Quantité", "Total", ""].map((x) => h("th", {}, x)))),
        h("tbody", {}, lines.map((l) => h("tr", {},
          h("td", {}, h("b", {}, l.item.name), h("div", { class: "small muted" }, `minimum ${qty(l.item.min_quantity)}`)),
          h("td", {}, `${eur(l.item.unit_price)} / ${l.item.unit_label}`),
          h("td", {}, h("input", { type: "number", min: l.item.min_quantity, max: maxFor(l.item), step: 1, value: l.qty, "aria-label": `Quantité de ${l.item.name}`, style: "width:5.5rem",
            onchange: (e) => { const v = Math.floor(Number(e.target.value)); const c = readCart(); const x = c.find((y) => y.id === l.id); x.qty = v > 0 ? v : l.qty; saveCart(c); paintBar(); paint(); } }),
            l.qty < l.item.min_quantity || l.qty > maxFor(l.item) ? h("div", { class: "small", style: "color:var(--red)" }, `Entre ${qty(l.item.min_quantity)} et ${qty(maxFor(l.item))}`) : null),
          h("td", {}, eur(Math.round(l.item.unit_price * l.qty * 100) / 100)),
          h("td", {}, h("button", { class: "btn btn-ghost btn-sm", type: "button", "aria-label": `Retirer ${l.item.name}`, onclick: () => { saveCart(readCart().filter((y) => y.id !== l.id)); paintBar(); paint(); } }, "✕"))))))),
      h("p", { style: "margin:.8rem 0 0" }, `${qty(t.n)} article${t.n > 1 ? "s" : ""} — sous-total ${eur(t.sub)}`),
      h("p", { style: "margin:.2rem 0 0" }, t.d > 0 ? h("b", {}, `Remise de quantité : -${t.d} %`) : "Pas encore de remise.", " ", h("span", { class: "muted" }, hint(t.n))),
      h("div", { class: "shop-total" }, `Total : ${eur(t.total)}`),
      h("div", { class: "field" }, h("label", { for: "shop-note" }, "Message pour la direction"), note),
      ...(profile ? [] : [h("div", { class: "notice warn" }, "Connecte-toi pour passer la commande (ton panier est conservé). ", h("a", { href: "compte.html?next=boutique.html" }, "Se connecter ou créer un compte"))]));
    if (!profile) submit.disabled = true;
  }
  paint();
  submit.addEventListener("click", () => run(submit, async () => {
    const lines = cartLines();
    const { data, error } = await sb.rpc("create_shop_cart_order", { p_lines: lines.map((l) => ({ item: l.id, quantity: l.qty })), p_note: note.value });
    if (error) throw error;
    saveCart([]); paintBar();
    callFn("admin-actions", { action: "flush_notifications" }).catch(() => {});
    clear(body).append(h("div", { class: "notice ok" }, h("b", {}, "Commande enregistrée."),
      h("p", { style: "margin:.4rem 0 0" }, `${qty(data.quantity)} article${data.quantity > 1 ? "s" : ""}${data.discount_percent > 0 ? `, remise -${Number(data.discount_percent)} %` : ""} : ${eur(data.total_price)}. Statut : à payer. Va payer ce montant en argent RP, en jeu, auprès de la direction.`)),
      h("p", {}, h("a", { href: "compte.html#commandes" }, "Voir mes commandes")));
    submit.remove(); toast("Commande enregistrée.", "ok");
    load();
  }));
}

async function load() {
  const { data, error } = await sb.from("shop_items").select("*").eq("is_active", true).order("sort_order").order("name");
  clear(grid);
  if (error) return grid.append(h("div", { class: "notice err" }, friendly(error)));
  items = data;
  saveCart(readCart().filter((l) => byId(l.id)));
  paintBar();
  if (!data.length) return grid.append(h("p", { class: "muted" }, "Aucun article en vente pour l'instant."));
  grid.append(...data.map(card));
}
await load();
