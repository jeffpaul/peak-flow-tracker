(function () {
  "use strict";

  const state = {
    entries: [],
    config: null,
    sortKey: "id",
    sortDir: "desc",
    filterZone: "all",
    filterText: "",
    page: 1,
    pageSize: 10,
    rangePreset: "all", // "all" | "7" | "30" | "90" | "custom"
    rangeFrom: "",
    rangeTo: "",
    chartType: "line", // "line" | "bar" | "pie" | "histogram"
  };

  const ZONE_RANK = { green: 0, yellow: 1, red: 2 };
  const REDUCED_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let chartInstance = null;

  /* ------------------------------------------------------------------ *
   * Theme
   * ------------------------------------------------------------------ */
  function wireTheme() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    const update = () => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      btn.setAttribute("aria-pressed", String(dark));
      btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    };
    update();
    btn.addEventListener("click", () => {
      if (window.__pftTheme) window.__pftTheme.toggle();
      update();
      if (chartInstance) renderChart(applyFilters(state.entries), state.config);
    });
  }

  /* ------------------------------------------------------------------ *
   * Date helpers
   * ------------------------------------------------------------------ */
  function toYMD(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function todayYMD() {
    return toYMD(new Date());
  }

  function shiftDate(ymd, deltaDays) {
    const [y, m, d] = ymd.split("-").map(Number);
    return toYMD(new Date(y, m - 1, d + deltaDays));
  }

  function daysBetween(fromYmd, toYmd) {
    const [y1, m1, d1] = fromYmd.split("-").map(Number);
    const [y2, m2, d2] = toYmd.split("-").map(Number);
    return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
  }

  function activeRange() {
    const p = state.rangePreset;
    if (p === "all") return { from: null, to: null };
    if (p === "custom") return { from: state.rangeFrom || null, to: state.rangeTo || null };
    const days = Number(p);
    const to = todayYMD();
    return { from: shiftDate(to, -(days - 1)), to };
  }

  function priorRange(range) {
    if (!range.from || !range.to) return { from: null, to: null };
    const len = daysBetween(range.from, range.to) + 1;
    const priorTo = shiftDate(range.from, -1);
    return { from: shiftDate(priorTo, -(len - 1)), to: priorTo };
  }

  function withinRange(entry, from, to) {
    if (from && entry.date < from) return false;
    if (to && entry.date > to) return false;
    return true;
  }

  function rangeLabel() {
    const r = activeRange();
    if (!r.from || !r.to) return "All time";
    if (r.from === r.to) return r.from;
    const len = daysBetween(r.from, r.to) + 1;
    return len === 7 || len === 30 || len === 90 ? `Last ${len} days` : `${r.from} → ${r.to}`;
  }

  /* ------------------------------------------------------------------ *
   * Data loading
   * ------------------------------------------------------------------ */
  async function loadData() {
    const [readingsRes, configRes] = await Promise.all([
      fetch("data/readings.json", { cache: "no-store" }),
      fetch("data/config.json", { cache: "no-store" }),
    ]);
    const entries = await readingsRes.json();
    const config = await configRes.json();
    entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { entries, config };
  }

  /* ------------------------------------------------------------------ *
   * Stats
   * ------------------------------------------------------------------ */
  function zoneFor(value, zones) {
    if (value === null || value === undefined) return null;
    if (value >= zones.green.min) return "green";
    if (value >= zones.yellow.min) return "yellow";
    return "red";
  }

  function avg(list) {
    return list.length ? Math.round(list.reduce((s, e) => s + e.best, 0) / list.length) : null;
  }

  function pct(list, pred) {
    return list.length ? Math.round((list.filter(pred).length / list.length) * 100) : null;
  }

  function trend(cur, prev) {
    if (cur === null || prev === null) return null;
    if (cur > prev) return 1;
    if (cur < prev) return -1;
    return 0;
  }

  function zoneDistribution(list, zones) {
    if (!list.length) return null;
    const counts = { green: 0, yellow: 0, red: 0 };
    list.forEach((e) => {
      const z = zoneFor(e.best, zones);
      if (z) counts[z] += 1;
    });
    const total = list.length;
    return {
      green: Math.round((counts.green / total) * 100),
      yellow: Math.round((counts.yellow / total) * 100),
      red: Math.round((counts.red / total) * 100),
    };
  }

  function longestGreenStreak(list, zones) {
    let longest = 0;
    let current = 0;
    list.forEach((e) => {
      if (zoneFor(e.best, zones) === "green") {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    });
    return longest;
  }

  function dailySeries(list) {
    const byDate = new Map();
    list.forEach((e) => {
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date).push(e.best);
    });
    return [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([, vals]) => Math.round(vals.reduce((s, v) => s + v, 0) / vals.length))
      .slice(-30);
  }

  function computeStats(entries, config) {
    const zones = config.zones;
    const range = activeRange();
    const prev = priorRange(range);
    const cur = entries.filter((e) => withinRange(e, range.from, range.to));
    const earlier = entries.filter((e) => withinRange(e, prev.from, prev.to));

    const personalBest = entries.length ? Math.max(...entries.map((e) => e.best)) : null;
    const average = avg(cur);
    const averagePrior = avg(earlier);
    const averageTrend = trend(average, averagePrior);

    const highLow = cur.length
      ? { high: Math.max(...cur.map((e) => e.best)), low: Math.min(...cur.map((e) => e.best)) }
      : null;

    const zonePct = zoneDistribution(cur, zones);
    const zonePctPrior = zoneDistribution(earlier, zones);

    const rescue = pct(cur, (e) => e.afterRescue);
    const rescuePrior = pct(earlier, (e) => e.afterRescue);
    const rescueTrend = trend(rescue, rescuePrior);

    return {
      personalBest,
      average,
      averageTrend,
      averageDiff: average !== null && averagePrior !== null ? average - averagePrior : null,
      highLow,
      zonePct,
      zonePctPrior,
      greenStreak: longestGreenStreak(cur, zones),
      rescue,
      rescueTrend,
      spark: dailySeries(cur),
      rangeLabel: rangeLabel(),
      count: cur.length,
    };
  }

  /* ------------------------------------------------------------------ *
   * Sparkline
   * ------------------------------------------------------------------ */
  function sparklineSVG(series, color) {
    if (!series || series.length < 2) return "";
    const w = 120;
    const h = 32;
    const pad = 3;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = max - min || 1;
    const x = (i) => pad + (i / (series.length - 1)) * (w - pad * 2);
    const y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
    const points = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const base = series.map((_, i) => `${x(i).toFixed(1)},${(h - pad).toFixed(1)}`).join(" ");
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
  <polygon points="${base} ${points.split(" ").reverse().join(" ")}" fill="${color}" opacity="0.18" />
  <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;
  }

  /* ------------------------------------------------------------------ *
   * Stat rendering
   * ------------------------------------------------------------------ */
  function animateValue(el, target) {
    if (REDUCED_MOTION || !Number.isFinite(target)) {
      el.textContent = target;
      return;
    }
    const dur = 650;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function trendBadge(t, diffText) {
    const span = document.createElement("span");
    if (t === null) return span;
    if (t === 1) { span.className = "trend-up"; span.textContent = `▲ ${diffText || "up vs prior"}`; }
    else if (t === -1) { span.className = "trend-down"; span.textContent = `▼ ${diffText || "down vs prior"}`; }
    else { span.className = "trend-flat"; span.textContent = "— vs prior"; }
    return span;
  }

  function buildStat(label, sub) {
    const div = document.createElement("div");
    div.className = "stat";
    const value = document.createElement("div");
    value.className = "value";
    const lab = document.createElement("div");
    lab.className = "label";
    lab.textContent = label;
    const subEl = document.createElement("div");
    subEl.className = "sub";
    div.append(value, lab, subEl);
    if (sub) subEl.append(sub);
    return { div, value, subEl };
  }

  function renderStats(stats) {
    const el = document.getElementById("stats-grid");
    el.innerHTML = "";
    if (stats.count === 0 && stats.personalBest === null) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.style.gridColumn = "1 / -1";
      empty.textContent = "No readings yet — log your first one to start seeing trends.";
      el.appendChild(empty);
      return;
    }
    const reduced = REDUCED_MOTION;

    // Personal best (all time)
    {
      const c = buildStat("Personal best");
      c.div.classList.add("zone-green");
      c.subEl.textContent = "All time";
      animateValue(c.value, stats.personalBest !== null ? stats.personalBest : "—");
      el.appendChild(c.div);
    }

    // Average
    {
      const c = buildStat("Average");
      const sub = document.createDocumentFragment();
      sub.append(`${stats.rangeLabel} `);
      if (stats.averageTrend !== null) {
        sub.append(trendBadge(stats.averageTrend, stats.averageDiff > 0 ? `+${stats.averageDiff} vs prior` : `${stats.averageDiff} vs prior`));
      } else {
        sub.append("no prior data");
      }
      c.subEl.append(sub);
      if (stats.spark && stats.spark.length > 1) {
        c.value.insertAdjacentHTML("afterend", sparklineSVG(stats.spark, cssVar("--accent")));
      }
      animateValue(c.value, stats.average !== null ? stats.average : "—");
      el.appendChild(c.div);
    }

    // High / Low
    {
      const c = buildStat("High / Low");
      c.subEl.textContent = stats.rangeLabel;
      animateValue(c.value, stats.highLow ? `${stats.highLow.high} / ${stats.highLow.low}` : "—");
      el.appendChild(c.div);
    }

    // Longest green streak
    {
      const c = buildStat("Longest green streak");
      c.div.classList.add("zone-green");
      c.subEl.textContent = stats.rangeLabel;
      animateValue(c.value, `${stats.greenStreak} reading${stats.greenStreak === 1 ? "" : "s"}`);
      el.appendChild(c.div);
    }

    // Rescue inhaler use
    {
      const c = buildStat("Rescue inhaler use");
      c.div.classList.add("zone-red");
      const sub = document.createDocumentFragment();
      if (stats.rescueTrend !== null) {
        sub.append(trendBadge(stats.rescueTrend, null));
      } else {
        sub.append("no prior data");
      }
      c.subEl.append(sub);
      animateValue(c.value, stats.rescue !== null ? `${stats.rescue}%` : "—");
      el.appendChild(c.div);
    }

    // Zone mix
    {
      const c = buildStat("Zone mix");
      const box = document.createElement("div");
      box.className = "zone-box";
      box.style.marginTop = "0.5rem";

      if (!stats.zonePct) {
        const note = document.createElement("p");
        note.className = "empty-state";
        note.style.padding = "0.75rem";
        note.textContent = "No readings in this range.";
        box.appendChild(note);
        c.subEl.replaceWith(box);
        el.appendChild(c.div);
        return;
      }

      const bar = document.createElement("div");
      bar.className = "zone-bar";
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", `Zone mix: ${stats.zonePct.green}% green, ${stats.zonePct.yellow}% yellow, ${stats.zonePct.red}% red`);
      const segs = [
        ["z-green", stats.zonePct.green],
        ["z-yellow", stats.zonePct.yellow],
        ["z-red", stats.zonePct.red],
      ];
      segs.forEach(([cls, w]) => {
        const s = document.createElement("span");
        s.className = cls;
        s.style.width = `${w}%`;
        bar.appendChild(s);
      });
      box.appendChild(bar);

      const rows = document.createElement("div");
      rows.className = "zone-rows";
      const names = { green: "Green", yellow: "Yellow", red: "Red" };
      ["green", "yellow", "red"].forEach((z) => {
        const row = document.createElement("div");
        row.className = "zone-row";
        const sw = document.createElement("span");
        sw.className = `swatch ${z}`;
        const name = document.createElement("span");
        name.textContent = names[z];
        const pct = document.createElement("span");
        pct.className = "pct";
        const delta = document.createElement("span");
        delta.className = "delta";
        const p = stats.zonePct ? stats.zonePct[z] : null;
        const pPrior = stats.zonePctPrior ? stats.zonePctPrior[z] : null;
        row.append(sw, name, pct, delta);
        pct.textContent = `${p}%`;
        if (pPrior !== null && p !== null && p !== pPrior) {
          const up = p > pPrior;
          delta.textContent = `${up ? "▲" : "▼"} ${Math.abs(p - pPrior)}`;
          delta.className = `delta ${up ? "trend-up" : "trend-down"}`;
        } else if (pPrior !== null) {
          delta.textContent = "—";
          delta.className = "delta trend-flat";
        }
        rows.appendChild(row);
        animateValue(pct, `${p}%`);
      });
      box.appendChild(rows);
      c.subEl.replaceWith(box);
      el.appendChild(c.div);
    }
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function hexToRgba(hex, alpha) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return `rgba(37,99,235,${alpha})`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  /* ------------------------------------------------------------------ *
   * Chart
   * ------------------------------------------------------------------ */
  const zoneBandsPlugin = {
    id: "zoneBands",
    beforeDatasetsDraw(chart, _args, opts) {
      const zones = opts && opts.zones;
      if (!zones) return;
      const { ctx, chartArea, scales } = chart;
      const y = scales.y;

      const bands = [
        { from: y.min, to: zones.red.max, color: "rgba(244,67,54,0.10)" },
        { from: zones.yellow.min, to: zones.yellow.max, color: "rgba(255,193,7,0.12)" },
        { from: zones.green.min, to: y.max, color: "rgba(76,175,80,0.12)" },
      ];

      ctx.save();
      bands.forEach((band) => {
        const yTop = y.getPixelForValue(band.to);
        const yBottom = y.getPixelForValue(band.from);
        if (yTop > chartArea.bottom || yBottom < chartArea.top) return;
        ctx.fillStyle = band.color;
        ctx.fillRect(chartArea.left, Math.max(yTop, chartArea.top), chartArea.right - chartArea.left, Math.min(yBottom, chartArea.bottom) - Math.max(yTop, chartArea.top));
      });

      // dashed zone-threshold gridlines
      const lines = [
        { v: zones.red.max, color: "rgba(244,67,54,0.35)" },
        { v: zones.yellow.min, color: "rgba(255,193,7,0.35)" },
        { v: zones.yellow.max, color: "rgba(255,193,7,0.3)" },
        { v: zones.green.min, color: "rgba(76,175,80,0.35)" },
      ];
      ctx.strokeStyle = lines[0].color;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      lines.forEach((l) => {
        const px = y.getPixelForValue(l.v);
        if (px < chartArea.top || px > chartArea.bottom) return;
        ctx.strokeStyle = l.color;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, px);
        ctx.lineTo(chartArea.right, px);
        ctx.stroke();
      });
      ctx.restore();
    },
  };

  function movingAverage(values, window) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    const q = [];
    for (let i = 0; i < values.length; i++) {
      q.push(values[i]);
      sum += values[i];
      if (q.length > window) sum -= q.shift();
      if (q.length === window) out[i] = Math.round(sum / window);
    }
    return out;
  }

  function rollingExtreme(values, window, isMax) {
    const out = new Array(values.length).fill(null);
    const q = [];
    for (let i = 0; i < values.length; i++) {
      q.push(values[i]);
      if (q.length > window) q.shift();
      if (q.length === window) out[i] = Math[isMax ? "max" : "min"](...q);
    }
    return out;
  }

  function symptomsList(e) {
    const map = { cough: "Cough", wheeze: "Wheeze", nighttimeAwakening: "Night waking" };
    return Object.keys(map).filter((k) => e.symptoms && e.symptoms[k]).map((k) => map[k]).join(", ");
  }

  function tooltipTheme() {
    return {
      backgroundColor: cssVar("--card-bg-solid"),
      titleColor: cssVar("--text"),
      bodyColor: cssVar("--text"),
      borderColor: cssVar("--border-strong"),
      borderWidth: 1,
      padding: 12,
      cornerRadius: 10,
      displayColors: false,
    };
  }

  function animationConfig() {
    return REDUCED_MOTION ? false : { duration: 700, easing: "easeOutQuart" };
  }

  function shortDateCallback(multiYear) {
    return function (value) {
      const label = this.getLabelForValue(value); // "2026-06-18 07:10 AM"
      const [y, m, d] = label.split(" ")[0].split("-");
      return `${Number(m)}/${Number(d)}${multiYear ? `/${y.slice(2)}` : ""}`;
    };
  }

  function timeSeriesTooltip(entries, zones) {
    return {
      callbacks: {
        title(items) {
          const e = entries[items[0].dataIndex];
          return e ? `${e.date} ${e.time} ${e.period}` : "";
        },
        label(ctx) {
          const e = entries[ctx.dataIndex];
          if (!e) return "";
          const zone = zoneFor(e.best, zones);
          const lines = [`Best: ${e.best} L/min (${zone} zone)`];
          lines.push(`Readings: ${e.readings.join(" / ")}`);
          if (e.afterRescue) lines.push("After rescue inhaler: yes");
          const syms = symptomsList(e);
          if (syms) lines.push(`Symptoms: ${syms}`);
          if (e.symptoms && e.symptoms.notes) lines.push(`Notes: ${e.symptoms.notes.slice(0, 80)}${e.symptoms.notes.length > 80 ? "…" : ""}`);
          return lines;
        },
      },
    };
  }

  function zoneColor(z) {
    if (z === "green") return cssVar("--green");
    if (z === "yellow") return cssVar("--yellow");
    return cssVar("--red");
  }

  function renderLineChart(canvas, entries, config) {
    const zones = config.zones;
    const labels = entries.map((e) => `${e.date} ${e.time} ${e.period}`);
    const best = entries.map((e) => e.best);
    const ma7 = movingAverage(best, 7);
    const ma30 = movingAverage(best, 30);
    const min14 = rollingExtreme(best, 14, false);
    const max14 = rollingExtreme(best, 14, true);

    const multiYear = entries[0].date.slice(0, 4) !== entries[entries.length - 1].date.slice(0, 4);

    const accent = cssVar("--accent");
    const green = cssVar("--green");
    const muted = cssVar("--muted");

    const pointColors = entries.map((e) => zoneColor(zoneFor(e.best, zones)));
    const pointStyles = entries.map((e) => (e.afterRescue ? "triangle" : "circle"));
    const pointRadii = entries.map((e) => (e.afterRescue ? 7 : 4));

    const yMax = Math.max(zones.green.max, ...best) + 20;
    const yMin = Math.max(0, Math.min(zones.red.max, ...best) - 30);

    chartInstance = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Best reading (L/min)", data: best, borderColor: accent, backgroundColor: accent, pointBackgroundColor: pointColors, pointBorderColor: pointColors, pointStyle: pointStyles, pointRadius: pointRadii, tension: 0.25, spanGaps: true, borderWidth: 2 },
          { label: "14-day low", data: min14, borderColor: hexToRgba(accent, 0.35), borderDash: [3, 4], pointRadius: 0, borderWidth: 1, spanGaps: false, fill: false },
          { label: "14-day range", data: max14, borderColor: hexToRgba(accent, 0.35), borderDash: [3, 4], pointRadius: 0, borderWidth: 1, spanGaps: false, fill: { target: "-1", above: hexToRgba(accent, 0.07) } },
          { label: "7-day average", data: ma7, borderColor: hexToRgba(green, 0.85), borderDash: [6, 5], pointRadius: 0, borderWidth: 2, spanGaps: false, fill: false },
          { label: "30-day average", data: ma30, borderColor: muted, borderDash: [2, 5], pointRadius: 0, borderWidth: 2, spanGaps: false, fill: false },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        animation: animationConfig(),
        scales: {
          y: { min: yMin, max: yMax, title: { display: true, text: "L/min", color: muted }, ticks: { color: muted }, grid: { color: "rgba(128,140,160,0.14)" } },
          x: { ticks: { maxRotation: 0, minRotation: 0, autoSkip: true, color: muted, callback: shortDateCallback(multiYear) }, grid: { display: false } },
        },
        plugins: {
          zoneBands: { zones },
          legend: { display: false },
          tooltip: { ...tooltipTheme(), ...timeSeriesTooltip(entries, zones) },
        },
      },
      plugins: [zoneBandsPlugin],
    });
  }

  function renderBarChart(canvas, entries, config) {
    const labels = entries.map((e) => `${e.date} ${e.time} ${e.period}`);
    const best = entries.map((e) => e.best);
    const colors = entries.map((e) => zoneColor(zoneFor(e.best, config.zones)));
    const muted = cssVar("--muted");
    const multiYear = entries[0].date.slice(0, 4) !== entries[entries.length - 1].date.slice(0, 4);
    const yMax = Math.max(config.zones.green.max, ...best) + 20;
    const yMin = Math.max(0, Math.min(config.zones.red.max, ...best) - 30);

    chartInstance = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: "Best reading (L/min)", data: best, backgroundColor: colors, borderColor: colors, borderWidth: 1, borderRadius: 3 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        animation: animationConfig(),
        scales: {
          y: { min: yMin, max: yMax, title: { display: true, text: "L/min", color: muted }, ticks: { color: muted }, grid: { color: "rgba(128,140,160,0.14)" } },
          x: { ticks: { maxRotation: 0, minRotation: 0, autoSkip: true, color: muted, callback: shortDateCallback(multiYear) }, grid: { display: false } },
        },
        plugins: { legend: { display: false }, tooltip: { ...tooltipTheme(), ...timeSeriesTooltip(entries, config.zones) } },
      },
    });
  }

  function renderPieChart(canvas, entries, config) {
    const counts = { green: 0, yellow: 0, red: 0 };
    entries.forEach((e) => {
      const z = zoneFor(e.best, config.zones);
      if (z) counts[z] += 1;
    });
    const total = entries.length;
    const colors = [cssVar("--green"), cssVar("--yellow"), cssVar("--red")];

    chartInstance = new Chart(canvas, {
      type: "pie",
      data: {
        labels: ["Green", "Yellow", "Red"],
        datasets: [{ data: [counts.green, counts.yellow, counts.red], backgroundColor: colors, borderColor: cssVar("--card-bg-solid"), borderWidth: 2 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: animationConfig(),
        plugins: {
          legend: { position: "bottom", labels: { color: cssVar("--text") } },
          tooltip: {
            ...tooltipTheme(),
            callbacks: {
              label(ctx) {
                return ` ${ctx.label}: ${ctx.parsed} (${Math.round((ctx.parsed / total) * 100)}%)`;
              },
            },
          },
        },
      },
    });
  }

  function renderHistogramChart(canvas, entries, config) {
    const values = entries.map((e) => e.best);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const width = 40;
    const start = Math.floor(min / width) * width;
    const binCount = Math.max(1, Math.ceil((max - start) / width));
    const labels = [];
    for (let i = 0; i < binCount; i++) {
      labels.push(`${start + i * width}–${start + (i + 1) * width - 1}`);
    }
    const counts = new Array(binCount).fill(0);
    entries.forEach((e) => {
      const idx = Math.min(Math.floor((e.best - start) / width), binCount - 1);
      counts[idx] += 1;
    });

    const accent = cssVar("--accent");
    const muted = cssVar("--muted");

    chartInstance = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: "Readings", data: counts, backgroundColor: hexToRgba(accent, 0.55), borderColor: accent, borderWidth: 1, borderRadius: 3 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: animationConfig(),
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0, color: muted }, grid: { color: "rgba(128,140,160,0.14)" }, title: { display: true, text: "Readings", color: muted } },
          x: { ticks: { color: muted, maxRotation: 45, minRotation: 45 } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipTheme(),
            callbacks: {
              title(items) {
                const bin = items[0].label;
                return bin ? `${bin} L/min` : "";
              },
              label(ctx) {
                return ` ${ctx.parsed} reading${ctx.parsed === 1 ? "" : "s"}`;
              },
            },
          },
        },
      },
    });
  }

  function renderChart(entries, config) {
    const canvas = document.getElementById("peak-flow-chart");
    if (!canvas) return;
    if (!entries.length) {
      if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
      canvas.style.display = "none";
      return;
    }
    canvas.style.display = "";

    if (chartInstance) chartInstance.destroy();

    if (state.chartType === "bar") renderBarChart(canvas, entries, config);
    else if (state.chartType === "pie") renderPieChart(canvas, entries, config);
    else if (state.chartType === "histogram") renderHistogramChart(canvas, entries, config);
    else renderLineChart(canvas, entries, config);
  }

  /* ------------------------------------------------------------------ *
   * Table
   * ------------------------------------------------------------------ */
  function applyFilters(entries) {
    const range = activeRange();
    return entries.filter((e) => {
      if (!withinRange(e, range.from, range.to)) return false;
      if (state.filterZone !== "all" && zoneFor(e.best, state.config.zones) !== state.filterZone) return false;
      if (state.filterText) {
        const symptomTerms = symptomsList(e).toLowerCase();
        const haystack = `${e.date} ${e.time} ${e.period} ${symptomTerms} ${(e.symptoms && e.symptoms.notes) || ""}`.toLowerCase();
        if (!haystack.includes(state.filterText.toLowerCase())) return false;
      }
      return true;
    });
  }

  function sortEntries(entries) {
    const key = state.sortKey;
    const dir = state.sortDir === "asc" ? 1 : -1;
    return [...entries].sort((a, b) => {
      let av = a[key];
      let bv = b[key];
      if (key === "zone") {
        av = ZONE_RANK[zoneFor(a.best, state.config.zones)];
        bv = ZONE_RANK[zoneFor(b.best, state.config.zones)];
      }
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
  }

  function cell(text, className) {
    const td = document.createElement("td");
    td.textContent = text;
    if (className) td.className = className;
    return td;
  }

  function notesCell(e) {
    const notes = (e.symptoms && e.symptoms.notes) || "";
    const td = document.createElement("td");
    td.className = "notes-cell";
    if (!notes) {
      td.textContent = "—";
      return td;
    }
    const text = document.createElement("span");
    text.className = "notes-text";
    text.textContent = notes;
    td.appendChild(text);
    if (notes.length > 64) {
      td.classList.add("is-truncated");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "note-toggle";
      btn.textContent = "more";
      btn.setAttribute("aria-expanded", "false");
      btn.addEventListener("click", () => {
        const open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!open));
        td.classList.toggle("is-truncated", open);
        btn.textContent = open ? "more" : "less";
      });
      td.appendChild(btn);
    }
    return td;
  }

  function renderPagination(totalItems, totalPages) {
    document.getElementById("page-info").textContent = `Page ${state.page} of ${totalPages} (${totalItems} total)`;
    document.getElementById("page-prev").disabled = state.page <= 1;
    document.getElementById("page-next").disabled = state.page >= totalPages;
  }

  function announce(msg) {
    const el = document.getElementById("live-region");
    if (el) el.textContent = msg;
  }

  function renderTable() {
    const filtered = applyFilters(state.entries);
    const sorted = sortEntries(filtered);
    const tbody = document.getElementById("history-tbody");
    tbody.innerHTML = "";

    const totalItems = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;

    if (!totalItems) {
      const emptyRow = document.createElement("tr");
      emptyRow.innerHTML = `<td colspan="7" class="empty-state">No readings match the current filters.</td>`;
      tbody.appendChild(emptyRow);
      renderPagination(totalItems, totalPages);
      announce(`No readings match the current filters.`);
      return;
    }

    const start = (state.page - 1) * state.pageSize;
    const pageItems = sorted.slice(start, start + state.pageSize);

    pageItems.forEach((e) => {
      const zone = zoneFor(e.best, state.config.zones);
      const tr = document.createElement("tr");
      if (zone === "red") tr.classList.add("row-red");
      else if (zone === "yellow") tr.classList.add("row-yellow");

      tr.appendChild(cell(`${e.date} ${e.time} ${e.period}`));
      tr.appendChild(cell(e.readings.join(" / ")));

      const bestTd = document.createElement("td");
      const strong = document.createElement("strong");
      strong.textContent = e.best;
      bestTd.appendChild(strong);
      tr.appendChild(bestTd);

      const zoneTd = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = `zone-pill ${zone || ""}`;
      pill.textContent = zone || "—";
      zoneTd.appendChild(pill);
      tr.appendChild(zoneTd);

      const rescueTd = document.createElement("td");
      if (e.afterRescue) {
        const badge = document.createElement("span");
        badge.className = "rescue-badge";
        badge.textContent = "▲ Yes";
        rescueTd.appendChild(badge);
      } else {
        rescueTd.textContent = "No";
      }
      tr.appendChild(rescueTd);

      tr.appendChild(cell(symptomsList(e) || "—"));
      tr.appendChild(notesCell(e));

      tbody.appendChild(tr);
    });

    renderPagination(totalItems, totalPages);
    announce(`Showing ${pageItems.length} of ${totalItems} matching readings, page ${state.page} of ${totalPages}.`);
  }

  function updateSortIndicators() {
    document.querySelectorAll("table.history th[data-key]").forEach((th) => {
      const key = th.dataset.key;
      const active = key === state.sortKey;
      th.classList.toggle("sorted", active);
      if (active) th.setAttribute("aria-sort", state.sortDir === "asc" ? "ascending" : "descending");
      else th.removeAttribute("aria-sort");
    });
  }

  function updateChips() {
    document.querySelectorAll(".chip[data-range]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.range === state.rangePreset);
    });
  }

  function updateRangeStatus() {
    const el = document.getElementById("range-status");
    if (!el) return;
    el.textContent = `Showing ${rangeLabel()} (${state.entries.filter((e) => withinRange(e, activeRange().from, activeRange().to)).length} of ${state.entries.length} readings).`;
  }

  function updateLegend() {
    const legend = document.getElementById("chart-legend");
    if (legend) legend.hidden = state.chartType !== "line";
  }

  function csvEscape(value) {
    const s = String(value === null || value === undefined ? "" : value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCSV() {
    const rows = sortEntries(applyFilters(state.entries));
    if (!rows.length) {
      announce("No readings to export.");
      return;
    }
    const header = ["Date", "Time", "Period", "Reading 1", "Reading 2", "Reading 3", "Best", "Zone", "After Rescue", "Symptoms", "Notes"];
    const lines = [header.join(",")];
    rows.forEach((e) => {
      lines.push(
        [
          e.date,
          e.time,
          e.period,
          e.readings[0],
          e.readings[1],
          e.readings[2],
          e.best,
          zoneFor(e.best, state.config.zones) || "",
          e.afterRescue ? "Yes" : "No",
          symptomsList(e),
          (e.symptoms && e.symptoms.notes) || "",
        ]
          .map(csvEscape)
          .join(","),
      );
    });

    const csv = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `peak-flow-tracker-${toYMD(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    announce(`Exported ${rows.length} reading${rows.length === 1 ? "" : "s"} to CSV.`);
  }

  function renderAll() {
    renderStats(computeStats(state.entries, state.config));
    renderChart(applyFilters(state.entries), state.config);
    renderTable();
    updateRangeStatus();
    updateLegend();
  }

  /* ------------------------------------------------------------------ *
   * Controls
   * ------------------------------------------------------------------ */
  function wireControls() {
    document.getElementById("zone-filter").addEventListener("change", (ev) => {
      state.filterZone = ev.target.value;
      state.page = 1;
      renderTable();
      renderChart(applyFilters(state.entries), state.config);
    });
    document.getElementById("text-filter").addEventListener("input", (ev) => {
      state.filterText = ev.target.value;
      state.page = 1;
      renderTable();
      renderChart(applyFilters(state.entries), state.config);
    });
    document.getElementById("export-csv").addEventListener("click", exportCSV);

    const chartType = document.getElementById("chart-type");
    if (chartType) {
      chartType.value = state.chartType;
      chartType.addEventListener("change", () => {
        state.chartType = chartType.value;
        updateLegend();
        renderChart(applyFilters(state.entries), state.config);
        announce(`Chart type: ${({ line: "Line", bar: "Bar", pie: "Pie", histogram: "Histogram" })[state.chartType]}`);
      });
    }
    document.getElementById("page-prev").addEventListener("click", () => {
      state.page -= 1;
      renderTable();
    });
    document.getElementById("page-next").addEventListener("click", () => {
      state.page += 1;
      renderTable();
    });

    document.querySelectorAll(".chip[data-range]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.rangePreset = btn.dataset.range;
        state.rangeFrom = "";
        state.rangeTo = "";
        document.getElementById("range-from").value = "";
        document.getElementById("range-to").value = "";
        updateChips();
        state.page = 1;
        renderAll();
      });
    });

    const rangeFrom = document.getElementById("range-from");
    const rangeTo = document.getElementById("range-to");
    rangeFrom.addEventListener("change", () => {
      state.rangePreset = "custom";
      state.rangeFrom = rangeFrom.value;
      if (rangeTo.value && rangeTo.value < rangeFrom.value) rangeTo.value = rangeFrom.value;
      state.rangeTo = rangeTo.value;
      updateChips();
      state.page = 1;
      renderAll();
    });
    rangeTo.addEventListener("change", () => {
      state.rangePreset = "custom";
      state.rangeTo = rangeTo.value;
      if (rangeFrom.value && rangeFrom.value > rangeTo.value) rangeFrom.value = rangeTo.value;
      state.rangeFrom = rangeFrom.value;
      updateChips();
      state.page = 1;
      renderAll();
    });

    document.querySelectorAll("table.history th[data-key]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir = "desc";
        }
        state.page = 1;
        updateSortIndicators();
        renderTable();
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Init
   * ------------------------------------------------------------------ */
  async function init() {
    wireTheme();
    try {
      const { entries, config } = await loadData();
      state.entries = entries;
      state.config = config;

      wireControls();
      updateSortIndicators();
      renderAll();
    } catch (err) {
      console.error("Failed to load peak flow data", err);
      const main = document.querySelector("main");
      main.innerHTML = `<div class="card empty-state">Couldn't load reading data. If you're viewing this locally, serve the folder over HTTP rather than opening index.html directly.</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
