import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));const config = JSON.parse(fs.readFileSync(`${REPO}/data/config.json`, "utf8"));

class El {
  constructor(tag, id) {
    this.tag = tag;
    this.id = id || "";
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.style = {};
    this.attrs = {};
    this._text = "";
    this._html = "";
    this.classList = {
      _set: new Set(),
      add: (...c) => c.forEach((x) => this.classList._set.add(x)),
      remove: (...c) => c.forEach((x) => this.classList._set.delete(x)),
      toggle: (c, force) => { const on = force === undefined ? !this.classList._set.has(c) : force; on ? this.classList._set.add(c) : this.classList._set.delete(c); return on; },
      contains: (c) => this.classList._set.has(c),
    };
    this.value = "";
    this.checked = false;
  }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  set innerHTML(v) { this._html = String(v); if (v === "") this.children = []; }
  get innerHTML() { return this._html; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  getAttribute(n) { return this.attrs[n] ?? null; }
  removeAttribute(n) { delete this.attrs[n]; }
  appendChild(c) { this.children.push(c); return c; }
  append(...c) { c.forEach((x) => this.children.push(x)); }
  remove() {}
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  fire(type, ev = {}) { (this.listeners[type] || []).forEach((fn) => fn({ target: this, ...ev })); }
  querySelector(sel) { return this._qs ? this._qs(sel) : null; }
  querySelectorAll(sel) { return this._qsAll ? this._qsAll(sel) : []; }
  focus() {}
}

const registry = {};
const reg = (id, el) => { registry[id] = el; return el; };

const form = new El("form", "log-form");
reg("log-form", form);
reg("entryDateTime", new El("input", "entryDateTime"));
const r1 = reg("reading1", new El("input", "reading1"));
const r2 = reg("reading2", new El("input", "reading2"));
const r3 = reg("reading3", new El("input", "reading3"));
reg("notes", new El("textarea", "notes"));
const afterRescue = reg("afterRescue", new El("input", "afterRescue"));
reg("live-region", new El("div", "live-region"));
reg("theme-toggle", new El("button", "theme-toggle"));

const fieldIds = ["field-datetime", "field-reading1", "field-reading2", "field-reading3"];
const readingInputs = { "field-reading1": r1, "field-reading2": r2, "field-reading3": r3 };
for (const id of fieldIds) {
  const f = new El("div", id);
  f._qs = (sel) => (sel === "input" ? readingInputs[id] || null : null);
  reg(id, f);
}

["preview-datetime", "preview-readings", "preview-best", "preview-zone", "preview-rescue", "preview-symptoms", "preview-notes-line"].forEach((id) => reg(id, new El("p", id)));

const symptoms = [
  { value: "Cough", checked: false },
  { value: "Wheeze", checked: false },
  { value: "Tight chest", checked: false },
].map((s) => Object.assign(new El("input", "sym"), s));
form._qsAll = (sel) => sel.includes('input[name="symptom"]') ? (sel.includes(":checked") ? symptoms.filter((x) => x.checked) : symptoms) : [];

const locationStub = { href: "" };
const documentStub = {
  documentElement: new El("html"),
  getElementById: (id) => registry[id] || null,
  createElement: (tag) => new El(tag),
  querySelectorAll: () => [],
  addEventListener: (type, fn) => { if (type === "DOMContentLoaded") documentStub._boot = fn; },
};

let fakeNow = 1000;
const windowStub = {
  location: locationStub,
  matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem: () => {}, },
  performance: { now: () => fakeNow },
  requestAnimationFrame: (cb) => { fakeNow += 16; cb(fakeNow); return 1; },
  __pftTheme: { current: "light", toggle() { documentStub.documentElement.setAttribute("data-theme", "dark"); return "dark"; } },
};
const context = {
  document: documentStub,
  window: windowStub,
  getComputedStyle: () => ({ getPropertyValue: () => "" }),
  fetch: async (url) => {
    if (url.includes("config.json")) return { json: async () => config };
    throw new Error("unexpected fetch " + url);
  },
  console, Date, Math, Object, Array, String, Number, Promise, URLSearchParams,
  location: locationStub,
};
context.globalThis = context;

let errors = 0;
const check = (label, cond, extra = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { errors++; console.log(`✗ ${label} ${extra}`); }
};

vm.runInNewContext(fs.readFileSync(`${REPO}/assets/log.js`, "utf8"), context);
await documentStub._boot();
await new Promise((r) => setTimeout(r, 0));

check("datetime defaulted", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(registry["entryDateTime"].value));

// 1) submit empty form -> validation errors
form.fire("submit", { preventDefault() {} });
check("empty submit blocked with 3 reading errors", /reading 1, reading 2, reading 3/.test(registry["live-region"].textContent));
check("reading1 marked aria-invalid", r1.getAttribute("aria-invalid") === "true");
check("no navigation on invalid", locationStub.href === "");

// 2) out-of-range + non-integer
r1.value = "42";
r2.value = "400.5";
r3.value = "900";
form.fire("submit", { preventDefault() {} });
const fieldErr1 = registry["field-reading1"].children.map((c) => c.textContent).join(" ");
check("range errors flagged", /between 60 and 800/.test(fieldErr1));

// 3) valid entry -> preview + navigation
r1.value = "420";
r2.value = "380";
r3.value = "400";
afterRescue.checked = true;
symptoms[0].checked = true;
registry["notes"].value = "morning, after walk";
for (const id of ["entryDateTime", "reading1", "reading2", "reading3", "notes", "afterRescue"]) registry[id].fire("input");
symptoms[0].fire("change");

check("preview best", registry["preview-best"].textContent === "420 L/min");
check("preview zone green", registry["preview-zone"].textContent === "green" && registry["preview-zone"].className.includes("green"));
check("preview readings", registry["preview-readings"].textContent === "420 / 380 / 400");
check("preview rescue", registry["preview-rescue"].textContent === "Yes");
check("preview symptoms", registry["preview-symptoms"].textContent === "Cough");

form.fire("submit", { preventDefault() {} });
const url = locationStub.href;
check("navigates to GitHub new issue", url.startsWith("https://github.com/jeffpaul/peak-flow-tracker/issues/new?"));
check("template param", url.includes("template=reading.yml"));
check("reading1 param", url.includes("reading1=420"));
check("symptoms param encoded", url.includes("symptoms=Cough"));
check("notes param encoded", url.includes("notes=morning%2C+after+walk"));
check("announce best", /420 L\/min/.test(registry["live-region"].textContent));

console.log(errors ? `\n${errors} failures` : "\nall log-page checks passed");
process.exit(errors ? 1 : 0);
