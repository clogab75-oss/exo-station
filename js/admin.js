import { sb, h, clear, initChrome, eur, frDate, frDateTime, todayISO, addDays, diffDays, openDialog, confirmDialog, toast, friendly, run, callFn,
  statusBadge, STATUS, signedUrl, panelPhotoUrl, readImageSize, mb } from "./core.js";
import { RangePicker } from "./calendar.js";

const profile = await initChrome("admin");
const app = document.getElementById("app");

/* ============================================================ état */
const S = { panels: [], reservations: [], clients: [], tab: "planning", filter: {}, plan: { view: "mois", anchor: todayISO() } };
const TABS = [["planning", "Planning"], ["install", "À installer"], ["reservations", "Réservations"], ["panels", "Panneaux"], ["clients", "Clients"], ["journal", "Journal"], ["settings", "Annonces et réglages"]];

async function loadData() {
  const [p, r, c] = await Promise.all([
    sb.from("panels").select("*").order("sort_order").order("name"),
    sb.from("reservations").select("*, profiles(nom_rp, prenom_rp), panels(name, width_px, height_px), reservation_images(id, storage_path, is_current)").order("start_date", { ascending: false }),
    sb.from("profiles").select("*").eq("role", "client").order("created_at", { ascending: false }),
  ]);
  for (const x of [p, r, c]) if (x.error) throw x.error;
  S.panels = p.data; S.reservations = r.data; S.clients = c.data;
}
const who = (r) => (r.profiles ? `${r.profiles.prenom_rp} ${r.profiles.nom_rp}` : "—");
const curImg = (r) => r.reservation_images?.find((i) => i.is_current);
const table = (heads, rows) => h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, heads.map((x) => h("th", {}, x)))), h("tbody", {}, rows)));
const empty = (t) => h("p", { class: "muted" }, t);

async function start() {
  const tabs = h("div", { class: "tabs", role: "tablist" });
  const view = h("div", { id: "view" });
  const kpis = h("div", { class: "kpis" });
  app.replaceChildren(h("h1", {}, "Administration"), kpis, tabs, view);

  async function reload() { try { await loadData(); } catch (e) { toast(friendly(e), "err"); } paint(); }
  function paint() {
    const n = (f) => S.reservations.filter(f).length;
    clear(kpis).append(
      kpi("À payer", n((r) => r.status === "a_payer")), kpi("À installer", n((r) => r.status === "payee")),
      kpi("Demandes d'annulation", n((r) => r.cancel_requested && !["annulee", "terminee"].includes(r.status))), kpi("Clients inscrits", S.clients.length));
    clear(tabs).append(...TABS.map(([id, label]) => h("button", { class: "tab", role: "tab", type: "button", "aria-selected": String(id === S.tab), onclick: () => { S.tab = id; paint(); } }, label)));
    clear(view);
    ({ planning, install, reservations, panels, clients, journal, settings })[S.tab](view);
  }
  S.reload = reload;
  await reload();
}
const kpi = (label, v) => h("div", { class: "kpi" }, label, h("b", {}, String(v)));

/* ============================================================ planning */
function planning(root) {
  const { view, anchor } = S.plan;
  let from, count;
  if (view === "jour") { from = anchor; count = 1; }
  else if (view === "semaine") { const d = new Date(anchor + "T00:00:00Z"); from = addDays(anchor, -((d.getUTCDay() + 6) % 7)); count = 7; }
  else { from = anchor.slice(0, 8) + "01"; const d = new Date(Date.UTC(+anchor.slice(0, 4), +anchor.slice(5, 7), 0)); count = d.getUTCDate(); }
  const to = addDays(from, count - 1);
  const step = view === "jour" ? 1 : view === "semaine" ? 7 : 0;
  const move = (dir) => { S.plan.anchor = step ? addDays(anchor, dir * step) : (() => { const d = new Date(Date.UTC(+anchor.slice(0, 4), +anchor.slice(5, 7) - 1 + dir, 1)); return d.toISOString().slice(0, 10); })(); S.reload(); };
  const label = view === "jour" ? frDate(from) : `${frDate(from)} → ${frDate(to)}`;

  root.append(h("div", { class: "filters" },
    h("div", {}, h("label", { for: "pv" }, "Vue"), h("select", { id: "pv", onchange: (e) => { S.plan.view = e.target.value; S.reload(); } },
      ["jour", "semaine", "mois"].map((v) => h("option", { value: v, selected: v === view }, v === "jour" ? "Journée" : v === "semaine" ? "Semaine" : "Mois")))),
    h("div", { style: "flex:2;display:flex;flex-wrap:wrap;gap:.5rem;align-items:end" },
      h("button", { class: "btn btn-ghost", type: "button", "aria-label": "Période précédente", onclick: () => move(-1) }, "‹"),
      h("button", { class: "btn btn-ghost", type: "button", onclick: () => { S.plan.anchor = todayISO(); S.reload(); } }, "Aujourd'hui"),
      h("button", { class: "btn btn-ghost", type: "button", "aria-label": "Période suivante", onclick: () => move(1) }, "›"),
      h("b", { style: "align-self:center;margin-left:.5rem" }, label))),
    h("div", { class: "legend", style: "margin-bottom:.8rem" }, ["a_payer", "payee", "installee", "terminee"].map((s) => statusBadge(s)),
      h("span", {}, "Contour pointillé : demande d'annulation"), h("span", {}, "Case vide : période libre")));

  const inRange = S.reservations.filter((r) => r.status !== "annulee" && r.start_date <= to && r.end_date >= from);
  if (!S.panels.length) return root.append(empty("Aucun panneau. Ajoute-en un dans l'onglet Panneaux."));

  if (view === "jour") {
    root.append(h("div", { class: "day-view" }, S.panels.map((p) => {
      const r = inRange.find((x) => x.panel_id === p.id);
      return h("div", { class: `day-card ${r ? "" : "free"}` }, h("h3", { style: "margin:0 0 .3rem" }, p.name, p.is_active ? "" : " (désactivé)"),
        r ? [h("p", { style: "margin:0" }, who(r)), h("p", { class: "muted small", style: "margin:0 0 .5rem" }, `${frDate(r.start_date)} → ${frDate(r.end_date)}`), statusBadge(r.status), " ",
          h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => resDialog(r) }, "Détails")]
          : h("p", { style: "margin:0" }, "Libre ce jour-là"));
    })));
    return;
  }
  const colW = view === "semaine" ? "minmax(90px,1fr)" : "minmax(30px,1fr)";
  const tpl = `160px repeat(${count}, ${colW})`;
  const days = Array.from({ length: count }, (_, i) => addDays(from, i));
  const head = h("div", { class: "pl-row pl-head", style: `grid-template-columns:${tpl}` }, h("div", { class: "pl-name" }, "Panneau"),
    days.map((d) => h("div", { class: `pl-cell ${d === todayISO() ? "today" : ""}`, title: frDate(d) }, view === "semaine" ? `${["lun", "mar", "mer", "jeu", "ven", "sam", "dim"][(new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7]} ${d.slice(8)}` : d.slice(8))));
  const rows = S.panels.map((p) => {
    const row = h("div", { class: "pl-row", style: `grid-template-columns:${tpl}` }, h("div", { class: "pl-name" }, p.name));
    days.forEach((d, i) => row.append(h("div", { class: `pl-cell ${d === todayISO() ? "today" : ""}`, style: `grid-column:${i + 2};grid-row:1` })));
    for (const r of inRange.filter((x) => x.panel_id === p.id)) {
      const a = Math.max(0, diffDays(from, r.start_date)), b = Math.min(count - 1, diffDays(from, r.end_date));
      row.append(h("button", { type: "button", class: `pl-bar st-${r.status} ${r.cancel_requested ? "pending-cancel" : ""}`, style: `grid-column:${a + 2}/${b + 3};grid-row:1`,
        title: `${who(r)} — ${STATUS[r.status]}`, onclick: () => resDialog(r) }, `${who(r)}`));
    }
    return row;
  });
  root.append(h("div", { class: "planner" }, head, rows));
}

/* ============================================================ à installer */
function install(root) {
  const items = S.reservations.filter((r) => r.status === "payee").sort((a, b) => a.start_date.localeCompare(b.start_date));
  root.append(h("h2", {}, "Publicités à installer"), h("p", { class: "muted" }, "Réservations payées dont la publicité n'est pas encore installée en jeu."));
  if (!items.length) return root.append(h("div", { class: "notice ok" }, "Rien à installer pour le moment."));
  const box = h("div", { class: "to-install" });
  for (const r of items) {
    const img = h("img", { alt: `Image de ${who(r)}` }); const i = curImg(r);
    if (i) signedUrl(i.storage_path).then((u) => (img.src = u)).catch(() => {});
    box.append(h("article", { class: "item" }, img,
      h("div", {}, h("h3", { style: "margin:0" }, r.panels?.name), h("p", { style: "margin:0" }, who(r)),
        h("p", { class: "muted small", style: "margin:0" }, `Du ${frDate(r.start_date)} au ${frDate(r.end_date)} (${r.days} j)`)),
      h("div", { class: "res-actions" },
        i ? h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: (e) => run(e.target, async () => { location.href = await signedUrl(i.storage_path, true); }) }, "Télécharger") : null,
        h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: (e) => act(e.target, "admin_mark_installed", { p_id: r.id }, "Marquée comme installée.") }, "Marquer installée"))));
  }
  root.append(box);
}

/* ============================================================ actions communes */
async function act(btn, fn, args, okMsg) {
  await run(btn, async () => { const { error } = await sb.rpc(fn, args); if (error) throw error; toast(okMsg, "ok"); callFn("admin-actions", { action: "flush_notifications" }).catch(() => {}); await S.reload(); });
}

function resDialog(r) {
  const img = h("img", { class: "preview", alt: "Image publicitaire", style: "max-height:240px" });
  const i = curImg(r);
  if (i) signedUrl(i.storage_path).then((u) => (img.src = u)).catch(() => {});
  const f = [];
  const dlgRef = {};
  const done = (btn, fn, args, msg) => act(btn, fn, args, msg).then(() => dlgRef.d?.close());
  if (r.status === "a_payer") f.push(h("button", { class: "btn btn-primary", type: "button", onclick: async (e) => { if (await confirmDialog("Confirmer le paiement", `Confirmer que ${who(r)} a payé ${eur(r.final_price)} en argent RP ?`, "Oui, payé")) done(e.target, "admin_confirm_payment", { p_id: r.id }, "Paiement confirmé."); } }, "Confirmer le paiement"));
  if (r.status === "payee") f.push(h("button", { class: "btn btn-primary", type: "button", onclick: (e) => done(e.target, "admin_mark_installed", { p_id: r.id }, "Marquée comme installée.") }, "Marquer installée"));
  if (["a_payer", "payee", "installee"].includes(r.status)) {
    f.push(h("button", { class: "btn btn-ghost", type: "button", onclick: () => { dlgRef.d?.close(); editDates(r); } }, "Modifier les dates"));
    f.push(h("button", { class: "btn btn-danger", type: "button", onclick: async (e) => { if (await confirmDialog("Annuler la réservation", `Annuler la réservation de ${who(r)} ? Les dates redeviennent libres.`, "Annuler la réservation", true)) done(e.target, "admin_cancel_reservation", { p_id: r.id, p_reason: "Annulée par la direction" }, "Réservation annulée."); } }, "Annuler"));
  }
  if (r.cancel_requested && !["annulee", "terminee"].includes(r.status)) f.push(
    h("button", { class: "btn btn-danger", type: "button", onclick: (e) => done(e.target, "admin_cancel_reservation", { p_id: r.id, p_reason: r.cancel_reason || "Demande du client acceptée" }, "Annulation acceptée.") }, "Accepter la demande d'annulation"),
    h("button", { class: "btn btn-ghost", type: "button", onclick: (e) => done(e.target, "admin_reject_cancel_request", { p_id: r.id }, "Demande refusée.") }, "Refuser la demande"));
  dlgRef.d = openDialog(`${r.panels?.name ?? "Panneau"} — ${who(r)}`, h("div", {},
    h("p", {}, statusBadge(r.status)),
    h("p", {}, `Du ${frDate(r.start_date)} au ${frDate(r.end_date)} (${r.days} jour${r.days > 1 ? "s" : ""})`),
    h("p", {}, `Prix : ${r.discount_percent > 0 ? `${eur(r.base_price)} − ${Number(r.discount_percent)} % = ` : ""}`, h("b", {}, eur(r.final_price)), ` (${eur(r.unit_price)} par jour)`),
    r.paid_at ? h("p", { class: "muted" }, `Payée le ${frDateTime(r.paid_at)} (${eur(r.paid_amount)})`) : null,
    r.installed_at ? h("p", { class: "muted" }, `Installée le ${frDateTime(r.installed_at)}`) : null,
    r.cancel_requested ? h("div", { class: "notice err" }, `Demande d'annulation du ${frDateTime(r.cancel_requested_at)}.`, r.cancel_reason ? ` Motif : ${r.cancel_reason}` : "") : null,
    i ? [img, h("p", {}, h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: (e) => run(e.target, async () => { location.href = await signedUrl(i.storage_path, true); }) }, "Télécharger l'image"))] : h("p", { class: "muted" }, "Aucune image.")), f);
}

function editDates(r) {
  const busy = S.reservations.filter((x) => x.panel_id === r.panel_id && x.id !== r.id && x.status !== "annulee").map((x) => ({ start: x.start_date, end: x.end_date, mine: false }));
  let sel = { start: r.start_date, end: r.end_date };
  const save = h("button", { class: "btn btn-primary", type: "button", disabled: true }, "Enregistrer");
  const msg = h("p", { class: "muted" }, `Actuel : du ${frDate(r.start_date)} au ${frDate(r.end_date)}.`);
  const picker = new RangePicker({ busy, selection: sel, onInvalid: (m) => toast(m, "err"), onChange: (s) => { sel = s; save.disabled = !(s.start && s.end); msg.textContent = s.end ? `Nouvelles dates : du ${frDate(s.start)} au ${frDate(s.end)}.` : "Choisis le dernier jour."; } });
  const d = openDialog("Modifier les dates", h("div", { class: "two-col" }, picker.el, h("div", {}, msg,
    h("p", { class: "notice" }, r.status === "a_payer" ? "Le prix sera recalculé." : "La réservation est déjà payée : le montant payé reste inchangé."))), [save]);
  save.addEventListener("click", () => act(save, "admin_update_reservation_dates", { p_id: r.id, p_start: sel.start, p_end: sel.end }, "Dates modifiées.").then(() => d.close()));
}

/* ============================================================ réservations */
function reservations(root) {
  const f = S.filter;
  const sel = (id, label, opts) => h("div", {}, h("label", { for: id }, label), h("select", { id, onchange: (e) => { f[id] = e.target.value; S.reload(); } }, opts.map(([v, t]) => h("option", { value: v, selected: (f[id] ?? "") === v }, t))));
  const inp = (id, label, type) => h("div", {}, h("label", { for: id }, label), h("input", { id, type, value: f[id] ?? "", onchange: (e) => { f[id] = e.target.value; S.reload(); } }));
  root.append(h("div", { class: "filters" },
    sel("fpanel", "Panneau", [["", "Tous"], ...S.panels.map((p) => [p.id, p.name])]),
    sel("fstatus", "Statut", [["", "Tous"], ...Object.entries(STATUS)]),
    inp("ffrom", "Période : du", "date"), inp("fto", "au", "date"), inp("fq", "Client", "search")));
  const q = (f.fq ?? "").toLowerCase();
  const rows = S.reservations.filter((r) => (!f.fpanel || r.panel_id === f.fpanel) && (!f.fstatus || r.status === f.fstatus)
    && (!f.ffrom || r.end_date >= f.ffrom) && (!f.fto || r.start_date <= f.fto) && (!q || who(r).toLowerCase().includes(q)));
  if (!rows.length) return root.append(empty("Aucune réservation ne correspond à ces filtres."));
  root.append(table(["Client", "Panneau", "Dates", "Prix", "Statut", ""], rows.map((r) => h("tr", {},
    h("td", {}, who(r)), h("td", {}, r.panels?.name), h("td", {}, `${frDate(r.start_date)} → ${frDate(r.end_date)}`), h("td", {}, eur(r.final_price)),
    h("td", {}, statusBadge(r.status), r.cancel_requested && !["annulee", "terminee"].includes(r.status) ? h("div", { class: "small", style: "color:var(--red)" }, "Annulation demandée") : null),
    h("td", {}, h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => resDialog(r) }, "Détails"))))));
}

/* ============================================================ panneaux */
function panels(root) {
  root.append(h("p", {}, h("button", { class: "btn btn-primary", type: "button", onclick: () => panelForm() }, "Ajouter un panneau")));
  if (!S.panels.length) return root.append(empty("Aucun panneau pour l'instant."));
  root.append(table(["Photo", "Nom", "Emplacement", "Dimensions", "Prix par jour", "Réservations", "État", ""], S.panels.map((p) => {
    const url = panelPhotoUrl(p.photo_path), n = S.reservations.filter((r) => r.panel_id === p.id && ["a_payer", "payee", "installee"].includes(r.status)).length;
    return h("tr", {}, h("td", {}, url ? h("img", { src: url, alt: "", style: "width:80px;border-radius:6px" }) : "—"), h("td", {}, h("b", {}, p.name)), h("td", {}, p.location || "—"),
      h("td", {}, `${p.width_px} × ${p.height_px} px`), h("td", {}, eur(p.daily_price)), h("td", {}, String(n)),
      h("td", {}, h("span", { class: `badge ${p.is_active ? "st-installee" : "st-terminee"}` }, p.is_active ? "Actif" : "Désactivé")),
      h("td", {}, h("div", { class: "res-actions" },
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => panelForm(p) }, "Modifier"),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: (e) => run(e.target, async () => { const { error } = await sb.from("panels").update({ is_active: !p.is_active }).eq("id", p.id); if (error) throw error; await S.reload(); }) }, p.is_active ? "Désactiver" : "Activer"),
        h("button", { class: "btn btn-danger btn-sm", type: "button", onclick: async (e) => { if (await confirmDialog("Supprimer le panneau", `Supprimer « ${p.name} » définitivement ? Impossible s'il a des réservations : désactive-le alors.`, "Supprimer", true))
          run(e.target, async () => { const { error } = await sb.from("panels").delete().eq("id", p.id); if (error) throw new Error(/foreign key/i.test(error.message) ? "Ce panneau a des réservations : désactive-le plutôt que de le supprimer." : error.message); toast("Panneau supprimé.", "ok"); await S.reload(); }); } }, "Supprimer"))));
  })));
}

function panelForm(p) {
  const v = p ?? { name: "", description: "", location: "", width_px: "", height_px: "", daily_price: "", is_active: true, sort_order: 0 };
  const photo = h("input", { id: "pf-photo", type: "file", accept: "image/png,image/jpeg,image/webp" });
  const F = (id, label, attrs = {}, hint) => h("div", { class: "field" }, h("label", { for: id }, label), attrs.tag === "textarea" ? h("textarea", { id, rows: 3, value: attrs.value }) : h("input", { id, ...attrs }), hint ? h("p", { class: "hint" }, hint) : null);
  const form = h("form", {},
    F("pf-name", "Nom", { value: v.name, required: true, maxlength: 80 }),
    F("pf-desc", "Description", { tag: "textarea", value: v.description }),
    F("pf-loc", "Emplacement", { value: v.location }),
    h("div", { class: "row" }, F("pf-w", "Largeur (px)", { type: "number", min: 1, value: v.width_px, required: true }), F("pf-h", "Hauteur (px)", { type: "number", min: 1, value: v.height_px, required: true }),
      F("pf-price", "Prix par jour (€)", { type: "number", min: 0, step: "0.01", value: v.daily_price, required: true })),
    F("pf-order", "Ordre d'affichage", { type: "number", value: v.sort_order }),
    h("div", { class: "field" }, h("label", { for: "pf-photo" }, "Photo du panneau en jeu"), photo),
    h("label", { style: "display:flex;gap:.5rem;align-items:center;font-weight:500" }, h("input", { id: "pf-active", type: "checkbox", checked: v.is_active, style: "width:auto" }), "Panneau actif (visible et réservable)"),
    p ? h("p", { class: "hint" }, "Les dimensions ne peuvent pas changer tant que des réservations sont en cours sur ce panneau.") : null);
  const save = h("button", { class: "btn btn-primary", type: "submit" }, "Enregistrer");
  form.append(h("div", { class: "dlg-foot", style: "padding:1rem 0 0" }, save));
  const dlg = openDialog(p ? `Modifier « ${p.name} »` : "Nouveau panneau", form);
  form.addEventListener("submit", (e) => { e.preventDefault();
    run(save, async () => {
      const g = (id) => form.querySelector("#" + id);
      const row = { name: g("pf-name").value.trim(), description: g("pf-desc").value, location: g("pf-loc").value, width_px: +g("pf-w").value, height_px: +g("pf-h").value,
        daily_price: +g("pf-price").value, sort_order: +g("pf-order").value || 0, is_active: g("pf-active").checked };
      let id = p?.id;
      if (p) { const { error } = await sb.from("panels").update(row).eq("id", id); if (error) throw error; }
      else { const { data, error } = await sb.from("panels").insert(row).select("id").single(); if (error) throw error; id = data.id; }
      const f = photo.files[0];
      if (f) {
        const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg", path = `${id}-${Date.now()}.${ext}`;
        const up = await sb.storage.from("panel-photos").upload(path, f, { contentType: f.type, upsert: false });
        if (up.error) throw up.error;
        const { error } = await sb.from("panels").update({ photo_path: path }).eq("id", id); if (error) throw error;
        if (p?.photo_path) await sb.storage.from("panel-photos").remove([p.photo_path]);
      }
      dlg.close(); toast("Panneau enregistré.", "ok"); await S.reload();
    }); });
}

/* ============================================================ clients */
async function clients(root) {
  const rec = h("div", {});
  root.append(h("h2", {}, "Demandes de récupération de compte"), rec, h("h2", { style: "margin-top:2rem" }, "Clients"));
  sb.from("recovery_requests").select("*, profiles(nom_rp, prenom_rp)").eq("status", "pending").order("created_at").then(({ data }) => {
    if (!data?.length) return rec.append(empty("Aucune demande en attente."));
    rec.append(table(["Client", "Demandé le", ""], data.map((q) => h("tr", {}, h("td", {}, q.profiles ? `${q.profiles.prenom_rp} ${q.profiles.nom_rp}` : q.identity_key), h("td", {}, frDateTime(q.created_at)),
      h("td", {}, h("div", { class: "res-actions" },
        q.user_id ? h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => newCode(q.user_id, q.profiles ? `${q.profiles.prenom_rp} ${q.profiles.nom_rp}` : "", q.id) }, "Donner un nouveau code") : null,
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: (e) => run(e.target, async () => { await callFn("admin-actions", { action: "resolve_recovery", id: q.id, status: "rejected" }); await S.reload(); }) }, "Refuser")))))));
  });
  if (!S.clients.length) return root.append(empty("Aucun client inscrit."));
  root.append(table(["Client", "Inscrit le", "Réservations", "Compte", ""], S.clients.map((c) => {
    const n = S.reservations.filter((r) => r.user_id === c.id).length;
    return h("tr", {}, h("td", {}, h("b", {}, `${c.prenom_rp} ${c.nom_rp}`)), h("td", {}, frDateTime(c.created_at)), h("td", {}, String(n)),
      h("td", {}, h("span", { class: `badge ${c.is_active ? "st-installee" : "st-annulee"}` }, c.is_active ? "Actif" : "Désactivé")),
      h("td", {}, h("div", { class: "res-actions" },
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { S.filter = { fq: `${c.prenom_rp} ${c.nom_rp}` }; S.tab = "reservations"; S.reload(); } }, "Ses réservations"),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => newCode(c.id, `${c.prenom_rp} ${c.nom_rp}`) }, "Nouveau code"),
        h("button", { class: `btn btn-sm ${c.is_active ? "btn-danger" : "btn-primary"}`, type: "button", onclick: async (e) => {
          if (c.is_active && !(await confirmDialog("Désactiver le compte", `${c.prenom_rp} ${c.nom_rp} ne pourra plus se connecter ni réserver.`, "Désactiver", true))) return;
          act(e.target, "admin_set_account_active", { p_user: c.id, p_active: !c.is_active }, c.is_active ? "Compte désactivé." : "Compte réactivé."); } }, c.is_active ? "Désactiver" : "Réactiver"))));
  })));
}
function newCode(userId, name, recoveryId) {
  const input = h("input", { id: "nc", type: "text", minlength: 4, maxlength: 64, autocomplete: "off", required: true });
  const ok = h("button", { class: "btn btn-primary", type: "button" }, "Enregistrer le code");
  const dlg = openDialog(`Nouveau code pour ${name}`, h("div", {}, h("p", {}, "Communique ce code au joueur en jeu. Il pourra le garder tel quel."), h("label", { for: "nc" }, "Nouveau code (4 caractères minimum)"), input), [ok]);
  ok.addEventListener("click", () => run(ok, async () => {
    await callFn("admin-actions", { action: "reset_code", user_id: userId, new_code: input.value });
    if (recoveryId) await callFn("admin-actions", { action: "resolve_recovery", id: recoveryId, status: "done" });
    dlg.close(); toast("Code réinitialisé.", "ok"); await S.reload();
  }));
}

/* ============================================================ journal */
async function journal(root) {
  const box = h("div", {}, h("p", { class: "muted" }, "Chargement…"));
  const sel = h("select", { id: "ja" }); const q = h("input", { id: "jq", type: "search", placeholder: "Rechercher dans les descriptions" });
  root.append(h("div", { class: "filters" }, h("div", {}, h("label", { for: "ja" }, "Type d'action"), sel), h("div", { style: "flex:2" }, h("label", { for: "jq" }, "Recherche"), q)), box);
  const { data, error } = await sb.from("activity_logs").select("*, actor:profiles!actor_id(nom_rp, prenom_rp), subject:profiles!subject_user_id(nom_rp, prenom_rp)").order("created_at", { ascending: false }).limit(400);
  if (error) return clear(box).append(h("p", { class: "notice err" }, friendly(error)));
  const actions = [...new Set(data.map((l) => l.action))].sort();
  sel.append(h("option", { value: "" }, "Toutes"), ...actions.map((a) => h("option", { value: a }, a.replaceAll("_", " "))));
  const nm = (p) => (p ? `${p.prenom_rp} ${p.nom_rp}` : "Système");
  const paint = () => {
    const rows = data.filter((l) => (!sel.value || l.action === sel.value) && (!q.value || l.description.toLowerCase().includes(q.value.toLowerCase())));
    clear(box).append(rows.length ? table(["Date et heure", "Par", "Client concerné", "Action", "Description"], rows.map((l) => h("tr", {},
      h("td", {}, frDateTime(l.created_at)), h("td", {}, nm(l.actor)), h("td", {}, l.subject ? nm(l.subject) : "—"), h("td", {}, l.action.replaceAll("_", " ")), h("td", {}, l.description)))) : empty("Aucun événement."));
  };
  sel.onchange = paint; q.oninput = paint; paint();
}

/* ============================================================ annonces & réglages */
async function settings(root) {
  const title = h("input", { id: "an-t", maxlength: 120 }), body = h("textarea", { id: "an-b", rows: 4 });
  const post = h("button", { class: "btn btn-primary", type: "button" }, "Publier l'annonce");
  post.onclick = () => run(post, async () => { await callFn("admin-actions", { action: "send_announcement", title: title.value, body: body.value }); title.value = body.value = ""; toast("Annonce publiée.", "ok"); await S.reload(); });
  const annBox = h("div", {});
  root.append(h("h2", {}, "Annonces"), h("div", { style: "max-width:560px" }, h("div", { class: "field" }, h("label", { for: "an-t" }, "Titre"), title), h("div", { class: "field" }, h("label", { for: "an-b" }, "Message"), body), post), annBox);
  sb.from("announcements").select("*").order("published_at", { ascending: false }).limit(20).then(({ data }) => {
    annBox.append(...(data ?? []).map((a) => h("div", { class: "announce" }, h("b", {}, a.title), " ", h("span", { class: "muted small" }, frDateTime(a.published_at)), a.is_published ? "" : " (masquée)", " ",
      h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: (e) => run(e.target, async () => { await sb.from("announcements").update({ is_published: !a.is_published }).eq("id", a.id); await S.reload(); }) }, a.is_published ? "Masquer" : "Afficher"),
      " ", h("button", { class: "btn btn-danger btn-sm", type: "button", onclick: (e) => run(e.target, async () => { await sb.from("announcements").delete().eq("id", a.id); await S.reload(); }) }, "Supprimer"))));
  });

  const { data: cfg } = await sb.from("server_configuration").select("key, value");
  const c = Object.fromEntries((cfg ?? []).map((r) => [r.key, r.value]));
  const size = h("input", { id: "cf-size", type: "number", min: 0.1, step: 0.1, value: ((c.max_image_bytes ?? 5242880) / 1048576).toFixed(1) });
  const instr = h("textarea", { id: "cf-pay", rows: 3 }); instr.value = c.payment_instructions ?? "";
  const save = h("button", { class: "btn btn-blue", type: "button" }, "Enregistrer les réglages");
  save.onclick = () => run(save, async () => {
    const ups = [{ key: "max_image_bytes", value: Math.round(Number(size.value) * 1048576), is_public: true }, { key: "payment_instructions", value: instr.value, is_public: true }];
    for (const u of ups) { const { error } = await sb.from("server_configuration").upsert(u); if (error) throw error; }
    toast("Réglages enregistrés.", "ok");
  });
  const queue = h("p", { class: "muted" }, "…");
  const flush = h("button", { class: "btn btn-ghost btn-sm", type: "button" }, "Envoyer les notifications en attente");
  flush.onclick = () => run(flush, async () => { const r = await callFn("admin-actions", { action: "flush_notifications" }); toast(`${r.sent} envoyée(s), ${r.failed} en échec.`, r.failed ? "err" : "ok"); loadQueue(); });
  async function loadQueue() {
    const { data } = await sb.from("notifications").select("status, last_error").neq("status", "sent");
    const failed = (data ?? []).filter((n) => n.status === "failed");
    queue.textContent = data?.length ? `${data.length} notification(s) Discord en attente dont ${failed.length} en échec${failed[0]?.last_error ? ` (dernière erreur : ${failed[0].last_error})` : ""}.` : "Toutes les notifications Discord sont envoyées.";
  }
  loadQueue();
  root.append(h("h2", { style: "margin-top:2.5rem" }, "Réglages"), h("div", { style: "max-width:560px" },
    h("div", { class: "field" }, h("label", { for: "cf-size" }, "Poids maximum d'une image (Mo)"), size),
    h("div", { class: "field" }, h("label", { for: "cf-pay" }, "Consignes de paiement affichées aux clients"), instr), save),
    h("h2", { style: "margin-top:2.5rem" }, "Notifications Discord"), queue, flush);
}

/* ============================================================ démarrage */
if (!profile) {
  app.replaceChildren(h("h1", {}, "Administration"), h("div", { class: "notice warn" }, "Connecte-toi avec le compte de la direction. ", h("a", { href: "compte.html?next=admin.html" }, "Se connecter")));
} else if (profile.role !== "admin") {
  app.replaceChildren(h("h1", {}, "Administration"), h("div", { class: "notice err" }, "Cet espace est réservé à la direction d'Exo Station."));
} else {
  await start();
}
