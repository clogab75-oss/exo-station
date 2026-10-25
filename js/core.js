import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm";
import { SUPABASE_URL, SUPABASE_KEY, LOGO_SRC, SITE_NAME } from "./config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/* ------------------------------------------------------------ DOM (jamais d'innerHTML avec des données) */
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === false || v == null) continue;
    if (k === "class") e.className = v;
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (k === "value") e.value = v;
    else if (v === true) e.setAttribute(k, "");
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    e.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return e;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const clear = (node) => { node.replaceChildren(); return node; };

/* ------------------------------------------------------------ formats */
export const eur = (n) =>
  `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
export const priceText = (n) =>
  Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
export const frDate = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
export const frDateTime = (ts) =>
  ts ? new Date(ts).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }) : "—";
export const todayISO = () => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
export const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const diffDays = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);
export const mb = (bytes) => `${(bytes / 1048576).toFixed(1).replace(".", ",")} Mo`;

export const STATUS = {
  a_payer: "À payer", payee: "Payée", installee: "Installée", terminee: "Terminée", annulee: "Annulée",
};
export const SHOP_STATUS = { a_payer: "À payer", payee: "Payée", livree: "Livrée", annulee: "Annulée" };
export const shopBadge = (s) => h("span", { class: `badge st-${s}` }, SHOP_STATUS[s] ?? s);
export const eur2 = (n) => (Number.isInteger(Number(n)) ? eur(n) : `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
export const qty = (n) => Number(n).toLocaleString("fr-FR");
export const shopImageUrl = (path) => (path ? sb.storage.from("shop-images").getPublicUrl(path).data.publicUrl : null);
export const statusBadge = (s) => h("span", { class: `badge st-${s}` }, STATUS[s] ?? s);

/* ------------------------------------------------------------ erreurs & messages */
export class AppError extends Error { constructor(code, message) { super(message); this.code = code; } }

/** « PANEL_UNAVAILABLE: texte » (SQL) -> texte lisible. */
export function friendly(err) {
  if (!err) return "Une erreur est survenue.";
  if (err instanceof AppError) return err.message;
  const msg = String(err.message ?? err);
  const m = /^[A-Z_]{4,}: (.*)$/s.exec(msg);
  if (m) return m[1];
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "Connexion impossible. Vérifie ta connexion et réessaie.";
  if (/row-level security|permission denied/i.test(msg)) return "Action non autorisée.";
  return "Une erreur est survenue. Réessaie dans un instant.";
}

let toastBox;
export function toast(text, kind = "") {
  toastBox ??= document.body.appendChild(h("div", { class: "toasts", role: "status", "aria-live": "polite" }));
  const t = toastBox.appendChild(h("div", { class: `toast ${kind}` }, text));
  setTimeout(() => t.remove(), kind === "err" ? 7000 : 4000);
}

/** Appel d'une Edge Function (JSON ou FormData). */
export async function callFn(name, body, { form } = {}) {
  const { data } = await sb.auth.getSession();
  const headers = { apikey: SUPABASE_KEY };
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  let payload = form;
  if (!form) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body ?? {}); }
  let res;
  try { res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: "POST", headers, body: payload }); }
  catch { throw new AppError("NETWORK", "Connexion impossible. Vérifie ta connexion et réessaie."); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) throw new AppError(j.code ?? "ERROR", j.message ?? "Une erreur est survenue.");
  return j;
}

/** Exécute une action avec bouton « occupé » et message d'erreur. */
export async function run(btn, fn) {
  const label = btn?.textContent;
  if (btn) { btn.disabled = true; }
  try { return await fn(); }
  catch (e) { toast(friendly(e), "err"); return undefined; }
  finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
}

/* ------------------------------------------------------------ session */
let profileCache;
export async function currentProfile(force = false) {
  if (profileCache !== undefined && !force) return profileCache;
  const { data } = await sb.auth.getSession();
  if (!data.session) return (profileCache = null);
  const { data: p } = await sb.from("profiles").select("id, nom_rp, prenom_rp, role, is_active").eq("id", data.session.user.id).maybeSingle();
  if (!p || !p.is_active) { await sb.auth.signOut(); return (profileCache = null); }
  return (profileCache = p);
}
export async function setSessionFrom(result) {
  const { error } = await sb.auth.setSession(result.session);
  if (error) throw new AppError("SESSION", "Session invalide, réessaie.");
  profileCache = undefined;
}
export async function logout() { await sb.auth.signOut(); profileCache = undefined; location.href = "index.html"; }

/* ------------------------------------------------------------ structure commune */
const PAGES = [
  ["index.html", "Accueil", "accueil"],
  ["tarifs.html", "Tarifs", "tarifs"],
  ["panneaux.html", "Panneaux", "panneaux"],
  ["boutique.html", "Boutique", "boutique"],
  ["compte.html", "Mon compte", "compte"],
];

export async function initChrome(active) {
  const profile = await currentProfile().catch(() => null);
  const logo = h("img", { src: LOGO_SRC, alt: "", width: 42, height: 42 });
  const wordmark = h("b", {}, "EXO STATION");
  const brand = h("a", { class: "brand", href: "index.html", "aria-label": `${SITE_NAME}, accueil` }, logo, wordmark);
  logo.addEventListener("error", () => logo.remove());

  const links = PAGES.map(([href, label, id]) =>
    h("a", { href, "aria-current": id === active ? "page" : false }, id === "compte" && profile ? profile.prenom_rp : label));
  if (profile?.role === "admin") links.push(h("a", { href: "admin.html", "aria-current": active === "admin" ? "page" : false }, "Administration"));

  document.body.prepend(
    h("div", { class: "canopy", "aria-hidden": "true" }),
    h("header", { class: "site-header" }, h("div", { class: "bar" }, brand, h("nav", { class: "nav", "aria-label": "Navigation principale" }, links))),
  );
  document.body.append(h("footer", { class: "site-footer" }, h("div", {},
    "Exo Station — station-service de Belle Roche, Amboise. Les paiements se font uniquement en argent RP, en jeu, auprès de la direction.")));

  const banner = h("div", { class: "offline", role: "alert", hidden: true }, "Tu es hors ligne. Les actions reprendront dès le retour de la connexion.");
  document.body.prepend(banner);
  const sync = () => (banner.hidden = navigator.onLine);
  addEventListener("online", sync); addEventListener("offline", sync); sync();
  return profile;
}

/* ------------------------------------------------------------ boîtes de dialogue */
export function openDialog(title, body, footer) {
  const dlg = h("dialog", { "aria-labelledby": "dlg-title" });
  const close = h("button", { class: "btn btn-ghost btn-sm", type: "button", "aria-label": "Fermer", onclick: () => dlg.close() }, "Fermer");
  dlg.append(h("div", { class: "dlg-head" }, h("h2", { id: "dlg-title" }, title), close), h("div", { class: "dlg-body" }, body));
  if (footer) dlg.append(h("div", { class: "dlg-foot" }, footer));
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

export function confirmDialog(title, text, okLabel = "Confirmer", danger = false) {
  return new Promise((resolve) => {
    const ok = h("button", { class: `btn ${danger ? "btn-danger" : "btn-primary"}`, type: "button" }, okLabel);
    const no = h("button", { class: "btn btn-ghost", type: "button" }, "Annuler");
    const dlg = openDialog(title, h("p", {}, text), [no, ok]);
    let result = false;
    ok.onclick = () => { result = true; dlg.close(); };
    no.onclick = () => dlg.close();
    dlg.addEventListener("close", () => resolve(result));
  });
}

/* ------------------------------------------------------------ images */
export async function signedUrl(path, download = false) {
  const { data, error } = await sb.storage.from("ad-images").createSignedUrl(path, 300, download ? { download: true } : undefined);
  if (error) throw error;
  return data.signedUrl;
}
export const panelPhotoUrl = (path) => (path ? sb.storage.from("panel-photos").getPublicUrl(path).data.publicUrl : null);

export function readImageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight, url }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new AppError("IMAGE_FORMAT", "Fichier illisible : choisis une image PNG ou JPG.")); };
    img.src = url;
  });
}

/* ------------------------------------------------------------ prix du gazole */
export async function fetchFuelPrice() {
  const { data, error } = await sb.rpc("get_current_fuel_price");
  if (error) throw error;
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

/* ------------------------------------------------------------ images de pub : même format que le panneau, taille de 1x à 4x */
export function imageFitsPanel(w, h, pw, ph) {
  return w > 0 && h > 0 && Math.abs(w * ph - h * pw) * 100 <= w * ph
    && w * 100 >= pw * 99 && h * 100 >= ph * 99 && w * 100 <= pw * 404 && h * 100 <= ph * 404;
}
export const imageRule = (p) => `format ${p.width_px} × ${p.height_px} (toute taille proportionnelle de ${p.width_px} × ${p.height_px} à ${p.width_px * 4} × ${p.height_px * 4} px, par exemple ${Math.round(p.width_px * 1.5)} × ${Math.round(p.height_px * 1.5)})`;
