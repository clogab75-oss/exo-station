import { sb, h, clear, initChrome, eur, frDate, frDateTime, todayISO, addDays, openDialog, confirmDialog, toast, friendly, run, callFn,
  setSessionFrom, logout, statusBadge, signedUrl, readImageSize, mb } from "./core.js";
import { RangePicker } from "./calendar.js";

const profile = await initChrome("compte");
const app = document.getElementById("app");
const params = new URLSearchParams(location.search);
const safeNext = () => { const n = params.get("next"); return /^[a-z]+\.html$/.test(n ?? "") ? n : "compte.html"; };

if (!profile) renderAuth(); else await renderAccount();

/* ------------------------------------------------------------------ connexion / inscription */
function renderAuth() {
  const body = h("div", { class: "auth-box" });
  const tabs = [["login", "Connexion"], ["register", "Créer un compte"]];
  let mode = "login";
  const bar = h("div", { class: "tabs", role: "tablist" });
  const paint = () => {
    clear(bar).append(...tabs.map(([id, label]) => h("button", { class: "tab", role: "tab", type: "button", "aria-selected": String(id === mode), onclick: () => { mode = id; paint(); } }, label)));
    clear(body).append(mode === "login" ? loginForm() : registerForm());
  };
  app.append(h("h1", {}, "Mon compte"), bar, body);
  paint();

  function fields(withHint) {
    return [
      h("div", { class: "row" },
        h("div", { class: "field" }, h("label", { for: "nom" }, "Nom RP"), h("input", { id: "nom", name: "nom", autocomplete: "family-name", required: true, maxlength: 40 })),
        h("div", { class: "field" }, h("label", { for: "prenom" }, "Prénom RP"), h("input", { id: "prenom", name: "prenom", autocomplete: "given-name", required: true, maxlength: 40 }))),
      h("div", { class: "field" }, h("label", { for: "code" }, "Code personnel"),
        h("input", { id: "code", name: "code", type: "password", autocomplete: withHint ? "new-password" : "current-password", required: true, minlength: 4, maxlength: 64 }),
        withHint ? h("p", { class: "hint" }, "4 caractères minimum. Choisis un code que tu retiendras : il n'est jamais stocké en clair. Un code plus long te protège mieux.") : null),
    ];
  }
  function loginForm() {
    const err = h("div", { class: "notice err", hidden: true, role: "alert" });
    const btn = h("button", { class: "btn btn-primary", type: "submit" }, "Se connecter");
    const form = h("form", { novalidate: false }, ...fields(false), err, btn,
      h("p", { style: "margin-top:1.2rem" }, h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => recovery() }, "J'ai oublié mon code")));
    form.addEventListener("submit", (e) => { e.preventDefault(); err.hidden = true;
      run(btn, async () => { btn.textContent = "Connexion…";
        try {
          const r = await callFn("login", { nom_rp: form.nom.value, prenom_rp: form.prenom.value, code: form.code.value });
          await setSessionFrom(r); location.href = safeNext();
        } catch (ex) { err.hidden = false; err.textContent = friendly(ex); }
      }); });
    return form;
  }
  function registerForm() {
    const err = h("div", { class: "notice err", hidden: true, role: "alert" });
    const btn = h("button", { class: "btn btn-primary", type: "submit" }, "Créer mon compte");
    const form = h("form", {}, h("p", { class: "muted" }, "Utilise le nom et le prénom de ton personnage en jeu. Ils servent à te retrouver quand tu viens payer."), ...fields(true), err, btn);
    form.addEventListener("submit", (e) => { e.preventDefault(); err.hidden = true;
      run(btn, async () => { btn.textContent = "Création…";
        try {
          const r = await callFn("register", { nom_rp: form.nom.value, prenom_rp: form.prenom.value, code: form.code.value });
          await setSessionFrom(r); location.href = safeNext();
        } catch (ex) { err.hidden = false; err.textContent = friendly(ex); }
      }); });
    return form;
  }
  function recovery() {
    const done = h("div", { class: "notice ok", hidden: true });
    const btn = h("button", { class: "btn btn-primary", type: "submit" }, "Envoyer la demande");
    const form = h("form", {},
      h("p", {}, "Indique ton nom et ton prénom RP. La direction sera prévenue et pourra te donner un nouveau code en jeu."),
      h("div", { class: "row" },
        h("div", { class: "field" }, h("label", { for: "r-nom" }, "Nom RP"), h("input", { id: "r-nom", name: "nom", required: true })),
        h("div", { class: "field" }, h("label", { for: "r-prenom" }, "Prénom RP"), h("input", { id: "r-prenom", name: "prenom", required: true }))),
      done, btn);
    const dlg = openDialog("Récupérer mon compte", form);
    form.addEventListener("submit", (e) => { e.preventDefault();
      run(btn, async () => { const r = await callFn("request-recovery", { nom_rp: form.nom.value, prenom_rp: form.prenom.value }); done.hidden = false; done.textContent = r.message; btn.hidden = true; }); });
    return dlg;
  }
}

/* ------------------------------------------------------------------ espace client */
async function renderAccount() {
  const list = h("div", {}, h("p", { class: "muted" }, "Chargement de tes réservations…"));
  app.append(
    h("div", { style: "display:flex;gap:1rem;align-items:center;flex-wrap:wrap" },
      h("h1", { style: "margin:0" }, `${profile.prenom_rp} ${profile.nom_rp}`),
      h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: logout }, "Se déconnecter"),
      profile.role === "admin" ? h("a", { class: "btn btn-blue btn-sm", href: "admin.html" }, "Administration") : null),
    h("h2", { style: "margin-top:2rem" }, "Mes réservations"), list);
  await refresh();

  async function refresh() {
    const [{ data, error }, { data: cfg }] = await Promise.all([
      sb.from("reservations").select("*, panels(name, width_px, height_px), reservation_images(id, storage_path, is_current, created_at)").order("start_date", { ascending: false }),
      sb.from("server_configuration").select("value").eq("key", "payment_instructions").maybeSingle(),
    ]);
    clear(list);
    if (error) return list.append(h("p", { class: "notice err" }, friendly(error)));
    if (!data.length) return list.append(h("div", { class: "notice" }, "Tu n'as encore aucune réservation. ", h("a", { href: "panneaux.html" }, "Découvrir les panneaux")));
    for (const r of data) list.append(resCard(r, cfg?.value));
  }

  function resCard(r, instructions) {
    const img = r.reservation_images.find((i) => i.is_current);
    const thumb = h("img", { alt: "Ton image publicitaire", src: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" });
    if (img) signedUrl(img.storage_path).then((u) => (thumb.src = u)).catch(() => {});
    const canEdit = r.status === "a_payer" && !r.cancel_requested;
    const canImage = ["a_payer", "payee"].includes(r.status) && !r.cancel_requested;
    const canCancel = ["a_payer", "payee", "installee"].includes(r.status) && !r.cancel_requested;
    const pay = r.status === "a_payer"
      ? h("p", { class: "notice warn", style: "margin:.6rem 0 0" }, `À payer en jeu : ${eur(r.final_price)}. `, instructions ?? "")
      : r.paid_at ? h("p", { class: "muted small", style: "margin:.4rem 0 0" }, `Payée le ${frDateTime(r.paid_at)} (${eur(r.paid_amount)}).`) : null;
    return h("article", { class: "res-card" }, thumb,
      h("div", {},
        h("h3", {}, r.panels?.name ?? "Panneau"),
        h("p", { style: "margin:0" }, `Du ${frDate(r.start_date)} au ${frDate(r.end_date)} — ${r.days} jour${r.days > 1 ? "s" : ""}`),
        h("p", { style: "margin:.2rem 0 0" },
          r.discount_percent > 0 ? [h("s", { class: "muted" }, eur(r.base_price)), " "] : null, h("b", {}, eur(r.final_price)),
          r.discount_percent > 0 ? ` (réduction de ${Number(r.discount_percent)} %)` : ""),
        r.cancel_requested ? h("p", { class: "notice err", style: "margin:.6rem 0 0" }, "Demande d'annulation envoyée. La direction va y répondre.") : null,
        pay),
      h("div", { style: "display:grid;gap:.6rem;justify-items:end" }, statusBadge(r.status),
        h("div", { class: "res-actions" },
          img ? h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: (e) => run(e.target, async () => { location.href = await signedUrl(img.storage_path, true); }) }, "Télécharger l'image") : null,
          canEdit ? h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => editDates(r) }, "Modifier les dates") : null,
          canImage ? h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => changeImage(r) }, "Changer l'image") : null,
          canCancel ? h("button", { class: "btn btn-danger btn-sm", type: "button", onclick: () => cancel(r) }, "Demander l'annulation") : null)));
  }

  async function editDates(r) {
    const from = todayISO();
    const { data, error } = await sb.rpc("get_panel_availability", { p_from: from, p_to: addDays(from, 400) });
    if (error) return toast(friendly(error), "err");
    const busy = data.filter((a) => a.panel_id === r.panel_id && !(a.is_mine && a.start_date === r.start_date && a.end_date === r.end_date))
      .map((a) => ({ start: a.start_date, end: a.end_date, mine: false }));
    let sel = { start: r.start_date, end: r.end_date };
    const msg = h("p", { class: "muted" }, `Dates actuelles : du ${frDate(r.start_date)} au ${frDate(r.end_date)}.`);
    const save = h("button", { class: "btn btn-primary", type: "button", disabled: true }, "Enregistrer");
    const picker = new RangePicker({ busy, selection: sel, onInvalid: (m) => toast(m, "err"), onChange: (s) => {
      sel = s; save.disabled = !(s.start && s.end);
      msg.textContent = s.end ? `Nouvelles dates : du ${frDate(s.start)} au ${frDate(s.end)}.` : `Début le ${frDate(s.start)}. Choisis le dernier jour.`; } });
    const dlg = openDialog("Modifier les dates", h("div", { class: "two-col" }, picker.el,
      h("div", {}, msg, h("p", { class: "notice" }, "Le prix est recalculé automatiquement. Tu ne peux modifier une réservation que tant qu'elle n'est pas payée."))), [save]);
    save.addEventListener("click", () => run(save, async () => {
      const { error: e2 } = await sb.rpc("update_my_reservation_dates", { p_id: r.id, p_start: sel.start, p_end: sel.end });
      if (e2) throw e2;
      dlg.close(); toast("Dates modifiées.", "ok"); await refresh();
    }));
  }

  function changeImage(r) {
    const input = h("input", { id: "new-img", type: "file", accept: "image/png,image/jpeg" });
    const err = h("div", { class: "notice err", hidden: true, role: "alert" });
    const preview = h("img", { class: "preview", alt: "Aperçu", hidden: true });
    const go = h("button", { class: "btn btn-primary", type: "button", disabled: true }, "Remplacer l'image");
    const p = r.panels;
    const show = (m) => { err.hidden = !m; err.textContent = m ?? ""; };
    input.addEventListener("change", async () => {
      go.disabled = true; preview.hidden = true; show(null);
      const f = input.files[0]; if (!f) return;
      if (!/^image\/(png|jpeg)$/.test(f.type)) return show("Format refusé : PNG, JPG ou JPEG uniquement.");
      try {
        const { width, height, url } = await readImageSize(f);
        if (width !== p.width_px || height !== p.height_px) return show(`Mauvaises dimensions : ${width} × ${height} px au lieu de ${p.width_px} × ${p.height_px} px.`);
        preview.src = url; preview.hidden = false; go.disabled = false;
      } catch (e) { show(friendly(e)); }
    });
    const dlg = openDialog("Changer l'image", h("div", {},
      h("div", { class: "field" }, h("label", { for: "new-img" }, `Nouvelle image (${p.width_px} × ${p.height_px} px)`), input, preview), err), [go]);
    go.addEventListener("click", () => run(go, async () => {
      const form = new FormData();
      form.set("action", "replace_image"); form.set("reservation_id", r.id); form.set("image", input.files[0]);
      await callFn("reserve", null, { form }); dlg.close(); toast("Image remplacée.", "ok"); await refresh();
    }));
  }

  async function cancel(r) {
    const reason = h("textarea", { id: "why", rows: 3, maxlength: 500, placeholder: "Motif (facultatif)" });
    const ok = h("button", { class: "btn btn-danger", type: "button" }, "Envoyer la demande");
    const dlg = openDialog("Demander l'annulation",
      h("div", {}, h("p", {}, "La direction recevra ta demande et décidera. Ta réservation reste active en attendant."), h("label", { for: "why" }, "Motif"), reason), [ok]);
    ok.addEventListener("click", () => run(ok, async () => {
      const { error } = await sb.rpc("request_reservation_cancellation", { p_id: r.id, p_reason: reason.value || null });
      if (error) throw error;
      dlg.close(); toast("Demande envoyée à la direction.", "ok"); await refresh();
    }));
  }
}
