import { sb, h, clear, initChrome, eur, frDate, todayISO, addDays, openDialog, toast, friendly, run, callFn, readImageSize, panelPhotoUrl, mb, AppError, imageFitsPanel, imageRule } from "./core.js";
import { RangePicker, availabilityCalendar } from "./calendar.js";

const profile = await initChrome("panneaux");
const app = document.getElementById("app");
const grid = h("div", { class: "grid" });
app.replaceChildren(
  h("h1", {}, "Panneaux publicitaires"),
  h("p", { class: "lead muted" }, "Choisis un panneau, vérifie ses disponibilités et réserve directement. Le paiement se fait ensuite en jeu auprès de la direction d'Exo Station."),
  grid);

let busyByPanel = new Map();
let maxBytes = 5 * 1024 * 1024;

async function load() {
  const from = todayISO(), to = addDays(from, 400);
  const [panels, avail, cfg] = await Promise.all([
    sb.from("panels").select("*").eq("is_active", true).order("sort_order").order("name"),
    sb.rpc("get_panel_availability", { p_from: from, p_to: to }),
    sb.from("server_configuration").select("value").eq("key", "max_image_bytes").maybeSingle(),
  ]);
  if (panels.error) throw panels.error;
  if (avail.error) throw avail.error;
  if (cfg.data) maxBytes = Number(cfg.data.value);
  busyByPanel = new Map();
  for (const a of avail.data ?? []) {
    if (!busyByPanel.has(a.panel_id)) busyByPanel.set(a.panel_id, []);
    busyByPanel.get(a.panel_id).push({ start: a.start_date, end: a.end_date, mine: a.is_mine });
  }
  clear(grid);
  if (!panels.data.length) grid.append(h("p", { class: "muted" }, "Aucun panneau n'est proposé pour le moment. Reviens bientôt."));
  for (const p of panels.data) grid.append(card(p));
}

function nextFree(p) {
  const busy = busyByPanel.get(p.id) ?? [];
  let d = todayISO();
  for (let i = 0; i < 400; i++, d = addDays(d, 1)) if (!busy.some((b) => b.start <= d && d <= b.end)) return d;
  return null;
}

function card(p) {
  const url = panelPhotoUrl(p.photo_path);
  const free = nextFree(p);
  return h("article", { class: "panel-card" },
    url ? h("img", { class: "panel-photo", src: url, alt: `Photo du panneau ${p.name} en jeu`, loading: "lazy" }) : h("div", { class: "panel-photo" }, "Photo à venir"),
    h("div", { class: "panel-body" },
      h("h3", {}, p.name),
      p.description ? h("p", { class: "muted", style: "margin:0" }, p.description) : null,
      h("ul", { class: "facts" },
        p.location ? h("li", {}, p.location) : null,
        h("li", {}, `${p.width_px} × ${p.height_px} px`),
        h("li", {}, free === todayISO() ? "Libre dès aujourd'hui" : free ? `Libre dès le ${frDate(free)}` : "Complet à l'année")),
      h("div", { class: "price-line" }, eur(p.daily_price), " ", h("small", {}, "par jour")),
      h("button", { class: "btn btn-primary", type: "button", onclick: () => openBooking(p) }, "Voir le calendrier et réserver")));
}

function openBooking(p) {
  const busy = busyByPanel.get(p.id) ?? [];
  if (!profile) {
    const cal = availabilityCalendar(busy);
    openDialog(p.name, h("div", { class: "two-col" }, cal.el,
      h("div", {}, h("p", {}, `Image attendue : format ${p.width_px} × ${p.height_px}, à toute échelle jusqu'à ×4 (PNG ou JPG). ${eur(p.daily_price)} par jour.`),
        h("div", { class: "notice warn" }, "Connecte-toi pour réserver ce panneau."),
        h("a", { class: "btn btn-primary", href: "compte.html?next=panneaux.html" }, "Se connecter ou créer un compte"))));
    return;
  }

  let sel = { start: null, end: null }, file = null, imgOk = false, quote = null, seq = 0;
  const quoteBox = h("div", { class: "quote", hidden: true, "aria-live": "polite" });
  const dates = h("p", { class: "muted" }, "Clique sur le premier jour, puis sur le dernier jour (inclus).");
  const err = h("div", { class: "notice err", hidden: true, role: "alert" });
  const preview = h("img", { class: "preview", alt: "Aperçu de ton image", hidden: true });
  const input = h("input", { id: "ad-file", type: "file", accept: "image/png,image/jpeg" });
  const submit = h("button", { class: "btn btn-primary", type: "button", disabled: true }, "Réserver ce panneau");
  const showErr = (m) => { err.hidden = !m; err.textContent = m ?? ""; };
  const refreshSubmit = () => { submit.disabled = !(sel.start && sel.end && imgOk && quote); };

  const picker = new RangePicker({ busy, onInvalid: (m) => toast(m, "err"), onChange: async (s) => {
    sel = s; quote = null; quoteBox.hidden = true; refreshSubmit();
    if (!s.start) return;
    if (!s.end) { dates.textContent = `Début le ${frDate(s.start)}. Choisis maintenant le dernier jour.`; return; }
    dates.textContent = `Du ${frDate(s.start)} au ${frDate(s.end)} (dates incluses).`;
    const my = ++seq;
    const { data, error } = await sb.rpc("quote_price", { p_panel: p.id, p_start: s.start, p_end: s.end });
    if (my !== seq) return;
    if (error) { showErr(friendly(error)); return; }
    showErr(null);
    quote = Array.isArray(data) ? data[0] : data;
    clear(quoteBox).append(
      h("div", {}, h("span", {}, `${quote.days} jour${quote.days > 1 ? "s" : ""} × ${eur(p.daily_price)}`), quote.discount_percent > 0 ? h("s", {}, eur(quote.base_price)) : h("span", {}, eur(quote.base_price))),
      quote.discount_percent > 0 ? h("div", {}, h("span", {}, `Réduction de ${Number(quote.discount_percent)} % (7 jours ou plus)`), h("span", {}, `− ${eur(quote.base_price - quote.final_price)}`)) : null,
      h("div", { class: "total" }, h("span", {}, "À payer en jeu"), h("span", {}, eur(quote.final_price))));
    quoteBox.hidden = false; refreshSubmit();
  } });

  input.addEventListener("change", async () => {
    file = input.files[0] ?? null; imgOk = false; preview.hidden = true; showErr(null); refreshSubmit();
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) return showErr("Format refusé : seules les images PNG, JPG et JPEG sont acceptées.");
    if (file.size > maxBytes) return showErr(`Image trop lourde : ${mb(file.size)} (maximum ${mb(maxBytes)}).`);
    try {
      const { width, height, url } = await readImageSize(file);
      if (!imageFitsPanel(width, height, p.width_px, p.height_px))
        return showErr(`Mauvaises dimensions : ton image fait ${width} × ${height} px, mais ce panneau demande le ${imageRule(p)}.`);
      preview.src = url; preview.hidden = false; imgOk = true; refreshSubmit();
    } catch (e) { showErr(friendly(e)); }
  });

  submit.addEventListener("click", () => run(submit, async () => {
    submit.textContent = "Envoi en cours…";
    const form = new FormData();
    form.set("action", "create"); form.set("panel_id", p.id); form.set("start_date", sel.start); form.set("end_date", sel.end); form.set("image", file);
    await callFn("reserve", null, { form });
    toast("Réservation enregistrée. Il reste à payer en jeu auprès de la direction.", "ok");
    setTimeout(() => (location.href = "compte.html"), 900);
  }));

  openDialog(`Réserver « ${p.name} »`,
    h("div", { class: "two-col" }, picker.el,
      h("div", {},
        h("p", { class: "muted", style: "margin-top:0" }, `${p.location ? p.location + " — " : ""}image de ${p.width_px} × ${p.height_px} px, ${eur(p.daily_price)} par jour.`),
        dates, quoteBox,
        h("div", { class: "field" }, h("label", { for: "ad-file" }, "Ton image publicitaire"), input,
          h("p", { class: "hint" }, `PNG ou JPG, ${imageRule(p)}, ${mb(maxBytes)} maximum.`), preview),
        err,
        h("div", { class: "notice" }, "Aucun paiement n'a lieu sur le site. Après la réservation, viens régler en argent RP auprès de la direction : la publicité n'est installée qu'une fois le paiement confirmé."))),
    [submit]);
}

load().catch((e) => clear(grid).append(h("p", { class: "notice err" }, friendly(e))));
