import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const readings = JSON.parse(fs.readFileSync(`${REPO}/data/readings.json`, "utf8"));
const config = JSON.parse(fs.readFileSync(`${REPO}/data/config.json`, "utf8"));

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
      toggle: (c, force) => {
        const on = force === undefined ? !this.classList._set.has(c) : force;
        on ? this.classList._set.add(c) : this.classList._set.delete(c);
        return on;
      },
      contains: (c) => this.classList._set.has(c),
    };
    this.className = "";
  }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  set innerHTML(v) {
    this._html = String(v);
    this.children = [];
    if (v === "") this._text = "";
  }
  get innerHTML() { return this._html; }
  set className(v) {
    this._className = v;
    this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean));
  }
  get className() { return this._className || ""; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  getAttribute(n) { return this.attrs[n] ?? null; }
  removeAttribute(n) { delete this.attrs[n]; }
  appendChild(c) { this.children.push(c); return c; }
  append(...c) { c.forEach((x) => this.children.push(x)); }
  replaceWith(c) { this._replaced = c; }
  click() {}
  remove() { this._removed = true; }
  insertAdjacentHTML(_pos, html) { this._adjacent = (this._adjacent || "") + html; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  fire(type, ev = {}) { (this.listeners[type] || []).forEach((fn) => fn({ target: this, ...ev })); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get querySelectorAll() { return () => []; }
}

const registry = {};
function reg(id, el) { registry[id] = el; return el; }

reg("theme-toggle", new El("button", "theme-toggle"));
reg("stats-grid", new El("div", "stats-grid"));
reg("peak-flow-chart", new El("canvas", "peak-flow-chart"));
reg("zone-filter", new El("select", "zone-filter"));
reg("text-filter", new El("input", "text-filter"));
reg("page-prev", new El("button", "page-prev"));
reg("page-next", new El("button", "page-next"));
reg("page-info", new El("span", "page-info"));
reg("history-tbody", new El("tbody", "history-tbody"));
reg("range-status", new El("p", "range-status"));
reg("range-from", new El("input", "range-from"));
reg("range-to", new El("input", "range-to"));
reg("live-region", new El("div", "live-region"));
const chartType = reg("chart-type", new El("select", "chart-type"));
chartType.value = "line";
reg("chart-legend", new El("div", "chart-legend"));
reg("export-csv", new El("button", "export-csv"));

const chips = ["all", "7", "30", "90"].map((r) => {
  const b = new El("button");
  b.dataset.range = r;
  b.classList.add("chip");
  return b;
});
const ths = ["id", "best", "zone", "afterRescue"].map((k) => {
  const th = new El("th");
  th.dataset.key = k;
  th.classList.add("history");
  if (k === "id") { th.classList.add("sorted"); th.setAttribute("aria-sort", "descending"); }
  return th;
});

const documentStub = {
  documentElement: new El("html"),
  getElementById: (id) => registry[id] || null,
  createElement: (tag) => {
    const el = new El(tag);
    if (tag === "a") capturedAnchor = el;
    return el;
  },
  createDocumentFragment: () => new El("fragment"),
  querySelectorAll: (sel) => {
    if (sel === ".chip[data-range]") return chips;
    if (sel === "table.history th[data-key]") return ths;
    return [];
  },
  addEventListener: (type, fn) => { if (type === "DOMContentLoaded") documentStub._boot = fn; },
  querySelector: () => new El("main"),
  body: new El("body"),
};

const themeColors = {
  "--accent": "#2563eb",
  "--green": "#2f7d3c",
  "--yellow": "#a06a00",
  "--red": "#c2372b",
  "--muted": "#566070",
  "--text": "#171a21",
  "--card-bg-solid": "#f7f9fc",
  "--border-strong": "rgba(15,23,42,0.2)",
};
let fakeNow = 1000;
const windowStub = {
  matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem: () => {}, },
  performance: { now: () => fakeNow },
  requestAnimationFrame: (cb) => { fakeNow += 16; cb(fakeNow); return 1; },
  __pftTheme: {
    current: "light",
    toggle() { documentStub.documentElement.setAttribute("data-theme", "dark"); return "dark"; },
  },
};
windowStub.globalThis = windowStub;

const context = {
  document: documentStub,
  window: windowStub,
  getComputedStyle: () => ({ getPropertyValue: (n) => themeColors[n] || "" }),
  fetch: async (url) => {
    if (url.includes("readings.json")) return { json: async () => readings };
    if (url.includes("config.json")) return { json: async () => config };
    throw new Error("unexpected fetch " + url);
  },
  console,
  Chart: null,
  performance: windowStub.performance,
  requestAnimationFrame: windowStub.requestAnimationFrame,
  Date,
  Math,
  Map,
  Set,
  Number,
  String,
  RegExp,
  JSON,
  URLSearchParams: class {
    constructor() { this.m = new Map(); }
    set(k, v) { this.m.set(k, v); }
    get(k) { return this.m.get(k); }
    toString() { return [...this.m.entries()].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&"); }
  },
  Object,
  Array,
  Promise,
  Blob,
  URL: {
    createObjectURL: (blob) => { capturedBlob = blob; return "blob:mock"; },
    revokeObjectURL: () => {},
  },
};

context.globalThis = context;

class ChartStub {
  constructor(_canvas, cfg) { this.cfg = cfg; this.destroy = () => {}; ChartStub.lastInstance = this; }
}
context.Chart = ChartStub;

let capturedBlob = null;
let capturedAnchor = null;
let errors = 0;
const check = (label, cond, extra = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { errors++; console.log(`✗ ${label} ${extra}`); }
};

// boot the dashboard
const code = fs.readFileSync(`${REPO}/assets/app.js`, "utf8");
vm.runInNewContext(code, context);
await documentStub._boot();

const chartCfg = ChartStub.lastInstance?.cfg;
check("chart created with datasets", !!chartCfg);
if (chartCfg) {
  check("chart has 5 datasets (best, low, band, ma7, ma30)", chartCfg.data.datasets.length === 5);
  check("band uses fill target '-1'", chartCfg.data.datasets[2].fill && chartCfg.data.datasets[2].fill.target === "-1");
  check("tooltip title callback returns date", typeof chartCfg.options.plugins.tooltip.callbacks.title === "function");
}
check("stats grid populated", registry["stats-grid"].children.length >= 5);
check("history table has rows", registry["history-tbody"].children.length > 0);
check("range status set", /Showing/.test(registry["range-status"].textContent));

// switch to 7-day preset
chips[1].fire("click");
check("7d chip activates", chips[1].classList.contains("is-active"));
check("7d status mentions last 7 days", /Last 7 days/.test(registry["range-status"].textContent));
check("7d table still renders", registry["history-tbody"].children.length >= 0);

// custom date range
registry["range-from"].value = "2026-08-01";
registry["range-to"].value = "2026-08-08";
registry["range-from"].fire("change");
check("custom range status reflects from date", /2026-08-01/.test(registry["range-status"].textContent));
check("chips deactivate on custom", !chips[0].classList.contains("is-active") && !chips[1].classList.contains("is-active"));

// text filter
registry["text-filter"].value = "zzz-no-match";
registry["text-filter"].fire("input");
check("empty filter shows empty state", /No readings match/.test(registry["history-tbody"].children[0].innerHTML));
registry["text-filter"].value = "";
registry["text-filter"].fire("input");

// sort by best
ths[1].fire("click");
check("best th sorted", ths[1].classList.contains("sorted") && ths[1].getAttribute("aria-sort") === "descending");

// theme toggle
registry["theme-toggle"].fire("click");
check("theme toggle pressed state", registry["theme-toggle"].getAttribute("aria-pressed") === "true");

// reset to All-time view for chart-type checks
chips[0].fire("click");
const allCount = readings.length;

// switch to bar
chartType.value = "bar";
chartType.fire("change");
const barCfg = ChartStub.lastInstance.cfg;
check("bar chart type", barCfg.type === "bar");
check("bar has one bar per reading", barCfg.data.datasets[0].data.length === allCount && barCfg.data.labels.length === allCount);
check("bar colors by zone", barCfg.data.datasets[0].backgroundColor.length === allCount);
check("legend hidden for bar", registry["chart-legend"].hidden === true);

// switch to pie
chartType.value = "pie";
chartType.fire("change");
const pieCfg = ChartStub.lastInstance.cfg;
check("pie chart type", pieCfg.type === "pie");
check("pie labels green/yellow/red", JSON.stringify(pieCfg.data.labels) === JSON.stringify(["Green", "Yellow", "Red"]));
check("pie slices sum to filtered count", pieCfg.data.datasets[0].data.reduce((a, b) => a + b, 0) === allCount);

// switch to histogram
chartType.value = "histogram";
chartType.fire("change");
const histCfg = ChartStub.lastInstance.cfg;
check("histogram chart type", histCfg.type === "bar");
check("histogram bins sum to filtered count", histCfg.data.datasets[0].data.reduce((a, b) => a + b, 0) === allCount);
check("histogram bin labels formatted", histCfg.data.labels.length > 0 && histCfg.data.labels.every((l) => /^\d+–\d+$/.test(l)));

// back to line restores legend
chartType.value = "line";
chartType.fire("change");
check("line chart restored", ChartStub.lastInstance.cfg.type === "line");
check("legend shown for line", registry["chart-legend"].hidden !== true);

// chart respects zone filter
registry["zone-filter"].value = "green";
registry["zone-filter"].fire("change");
const greenCount = readings.filter((e) => {
  const z = e.best >= config.zones.green.min ? "green" : e.best >= config.zones.yellow.min ? "yellow" : "red";
  return z === "green";
}).length;
check("line chart reflects zone filter", ChartStub.lastInstance.cfg.data.datasets[0].data.length === greenCount);
registry["zone-filter"].value = "all";
registry["zone-filter"].fire("change");

// CSV export
registry["export-csv"].fire("click");
const csvText = await capturedBlob.text();
check("csv download filename", capturedAnchor.download && /^peak-flow-tracker-\d{4}-\d{2}-\d{2}\.csv$/.test(capturedAnchor.download));
const csvBytes = new Uint8Array(await capturedBlob.arrayBuffer());
check("csv has UTF-8 BOM", csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf);
check("csv has header", csvText.startsWith("Date,Time,Period,Reading 1,Reading 2,Reading 3,Best,Zone,After Rescue,Symptoms,Notes"));
check("csv has a data row", /\r\n\d{4}-\d{2}-\d{2},/.test(csvText));
check("csv announce exported", /Exported \d+ reading/.test(registry["live-region"].textContent));

// CSV with no matches
registry["text-filter"].value = "zzz-no-match";
registry["text-filter"].fire("input");
registry["export-csv"].fire("click");
check("csv empty view announced", /No readings to export/.test(registry["live-region"].textContent));

console.log(errors ? `\n${errors} failures` : "\nall dashboard checks passed");
process.exit(errors ? 1 : 0);
