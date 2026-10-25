import { h, clear, todayISO, addDays } from "./core.js";

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DOW = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const pad = (n) => String(n).padStart(2, "0");
export const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

/**
 * Calendrier de sélection d'une période (dates inclusives).
 * busy : [{start, end, mine}]  — jours occupés (barrés) ou à moi (vert)
 * onChange({start, end}) appelé à chaque modification de la sélection.
 */
export class RangePicker {
  constructor({ busy = [], onChange = () => {}, onInvalid = () => {}, selection = {} } = {}) {
    this.busy = busy; this.onChange = onChange; this.onInvalid = onInvalid;
    this.sel = { start: selection.start ?? null, end: selection.end ?? null };
    const t = (this.sel.start ?? todayISO()).split("-");
    this.year = Number(t[0]); this.month = Number(t[1]) - 1;
    this.el = h("div", { class: "cal" });
    this.render();
  }
  setBusy(busy) { this.busy = busy; this.render(); }
  stateOf(day) {
    if (day < todayISO()) return "past";
    const b = this.busy.find((x) => x.start <= day && day <= x.end);
    return b ? (b.mine ? "mine" : "busy") : "free";
  }
  rangeFree(a, b) {
    for (let d = a; d <= b; d = addDays(d, 1)) { const s = this.stateOf(d); if (s === "busy" || s === "mine" || s === "past") return false; }
    return true;
  }
  pick(day) {
    const { start, end } = this.sel;
    if (!start || end || day < start) { this.sel = { start: day, end: null }; }
    else if (this.rangeFree(start, day)) { this.sel = { start, end: day }; }
    else { this.onInvalid("Cette période contient des jours déjà réservés. Choisis d'autres dates."); this.sel = { start: day, end: null }; }
    this.render(); this.onChange({ ...this.sel });
  }
  nav(delta) {
    this.month += delta;
    if (this.month < 0) { this.month = 11; this.year--; } else if (this.month > 11) { this.month = 0; this.year++; }
    this.render();
  }
  render() {
    clear(this.el);
    const first = new Date(Date.UTC(this.year, this.month, 1));
    const lead = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(this.year, this.month + 1, 0)).getUTCDate();
    const head = h("div", { class: "cal-head" },
      h("button", { class: "btn btn-ghost btn-sm", type: "button", "aria-label": "Mois précédent", onclick: () => this.nav(-1) }, "‹"),
      h("b", { "aria-live": "polite" }, `${MONTHS[this.month]} ${this.year}`),
      h("button", { class: "btn btn-ghost btn-sm", type: "button", "aria-label": "Mois suivant", onclick: () => this.nav(1) }, "›"));
    const grid = h("div", { class: "cal-grid", role: "grid" }, DOW.map((d) => h("div", { class: "cal-dow" }, d)));
    for (let i = 0; i < lead; i++) grid.append(h("span", { class: "cal-day empty" }));
    for (let d = 1; d <= days; d++) {
      const day = iso(this.year, this.month, d), st = this.stateOf(day);
      const { start, end } = this.sel;
      const edge = day === start || day === end;
      const inRange = start && end && day > start && day < end;
      const label = `${d} ${MONTHS[this.month]} ${this.year}` + (st === "busy" ? ", réservé" : st === "mine" ? ", ta réservation" : st === "past" ? ", passé" : "");
      grid.append(h("button", {
        type: "button", class: `cal-day ${st} ${edge ? "edge" : ""} ${inRange ? "in-range" : ""}`,
        disabled: st !== "free", "aria-label": label, "aria-pressed": edge ? "true" : "false", onclick: () => this.pick(day),
      }, String(d)));
    }
    this.el.append(head, grid, h("div", { class: "legend" },
      h("span", {}, "Libre"), h("span", { class: "l-busy" }, "Réservé"), h("span", { class: "l-mine" }, "Ta réservation"), h("span", { class: "l-sel" }, "Sélection")));
  }
}

/** Calendrier de lecture seule pour un panneau (page publique). */
export function availabilityCalendar(busy) {
  const p = new RangePicker({ busy });
  p.pick = () => {};
  p.render();
  return p;
}
