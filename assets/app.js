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
  };

  function zoneFor(value, zones) {
    if (value === null || value === undefined) return null;
    if (value >= zones.green.min) return "green";
    if (value >= zones.yellow.min) return "yellow";
    return "red";
  }

  const ZONE_RANK = { green: 0, yellow: 1, red: 2 };

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

  function withinDays(entry, days) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const entryDate = new Date(entry.id);
    return entryDate >= cutoff && entryDate <= now;
  }

  function zonePercentages(entries, zones) {
    if (!entries.length) return null;
    const counts = { green: 0, yellow: 0, red: 0 };
    entries.forEach((e) => {
      const z = zoneFor(e.best, zones);
      if (z) counts[z] += 1;
    });
    const total = entries.length;
    return {
      green: Math.round((counts.green / total) * 100),
      yellow: Math.round((counts.yellow / total) * 100),
      red: Math.round((counts.red / total) * 100),
    };
  }

  function longestGreenStreak(entries, zones) {
    let longest = 0;
    let current = 0;
    entries.forEach((e) => {
      if (zoneFor(e.best, zones) === "green") {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    });
    return longest;
  }

  function rescueFrequency(entries) {
    const usedRescue = (e) => e.afterRescue;
    const last30 = entries.filter((e) => withinDays(e, 30));
    const prev30 = entries.filter((e) => {
      const now = new Date();
      const entryDate = new Date(e.id);
      const start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const end = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return entryDate >= start && entryDate < end;
    });

    const pct = (arr) => (arr.length ? Math.round((arr.filter(usedRescue).length / arr.length) * 100) : null);
    const current = pct(last30);
    const previous = pct(prev30);

    let trend = "—";
    if (current !== null && previous !== null) {
      if (current > previous) trend = "▲ up vs prior 30 days";
      else if (current < previous) trend = "▼ down vs prior 30 days";
      else trend = "flat vs prior 30 days";
    }
    return { current, trend };
  }

  function computeStats(entries, config) {
    const zones = config.zones;
    const personalBest = entries.length ? Math.max(...entries.map((e) => e.best)) : null;

    const windows = [30, 60, 90].map((days) => ({
      days,
      pct: zonePercentages(entries.filter((e) => withinDays(e, days)), zones),
    }));

    const last30Entries = entries.filter((e) => withinDays(e, 30));
    const average30 = last30Entries.length
      ? Math.round(last30Entries.reduce((sum, e) => sum + e.best, 0) / last30Entries.length)
      : null;
    const highLow30 = last30Entries.length
      ? {
          high: Math.max(...last30Entries.map((e) => e.best)),
          low: Math.min(...last30Entries.map((e) => e.best)),
        }
      : null;

    return {
      personalBest,
      windows,
      longestGreenStreak: longestGreenStreak(entries, zones),
      rescue: rescueFrequency(entries),
      average30,
      highLow30,
    };
  }

  function renderStats(stats) {
    const el = document.getElementById("stats-grid");
    el.innerHTML = "";

    const cards = [];

    cards.push({
      label: "Personal best",
      value: stats.personalBest !== null ? `${stats.personalBest} L/min` : "—",
      zoneClass: "",
    });
    cards.push({
      label: "Average (30d)",
      value: stats.average30 !== null ? `${stats.average30} L/min` : "—",
      zoneClass: "",
    });
    cards.push({
      label: "High / Low (30d)",
      value: stats.highLow30 ? `${stats.highLow30.high} / ${stats.highLow30.low} L/min` : "—",
      zoneClass: "",
    });
    cards.push({
      label: "Longest green streak",
      value: `${stats.longestGreenStreak} reading${stats.longestGreenStreak === 1 ? "" : "s"}`,
      zoneClass: "",
    });

    const win30 = stats.windows.find((w) => w.days === 30);
    cards.push({
      label: "Green zone (30d)",
      value: win30 && win30.pct ? `${win30.pct.green}%` : "—",
      zoneClass: "zone-green",
    });
    cards.push({
      label: "Yellow zone (30d)",
      value: win30 && win30.pct ? `${win30.pct.yellow}%` : "—",
      zoneClass: "zone-yellow",
    });
    cards.push({
      label: "Red zone (30d)",
      value: win30 && win30.pct ? `${win30.pct.red}%` : "—",
      zoneClass: "zone-red",
    });
    cards.push({
      label: "Rescue inhaler use (30d)",
      value: stats.rescue.current !== null ? `${stats.rescue.current}%` : "—",
      zoneClass: "",
      sub: stats.rescue.trend,
    });

    cards.forEach((c) => {
      const div = document.createElement("div");
      div.className = `stat ${c.zoneClass}`;
      div.innerHTML = `
        <div class="value">${c.value}</div>
        <div class="label">${c.label}</div>
        ${c.sub ? `<div class="label">${c.sub}</div>` : ""}
      `;
      el.appendChild(div);
    });
  }

  let chartInstance = null;

  const zoneBandsPlugin = {
    id: "zoneBands",
    beforeDatasetsDraw(chart, _args, opts) {
      const zones = opts && opts.zones;
      if (!zones) return;
      const { ctx, chartArea, scales } = chart;
      const y = scales.y;

      const bands = [
        { from: y.min, to: zones.red.max, color: "rgba(244,67,54,0.12)" },
        { from: zones.yellow.min, to: zones.yellow.max, color: "rgba(255,193,7,0.14)" },
        { from: zones.green.min, to: y.max, color: "rgba(76,175,80,0.14)" },
      ];

      ctx.save();
      bands.forEach((band) => {
        const yTop = y.getPixelForValue(band.to);
        const yBottom = y.getPixelForValue(band.from);
        ctx.fillStyle = band.color;
        ctx.fillRect(chartArea.left, yTop, chartArea.right - chartArea.left, yBottom - yTop);
      });
      ctx.restore();
    },
  };

  function renderChart(entries, config) {
    const zones = config.zones;
    const canvas = document.getElementById("peak-flow-chart");
    const labels = entries.map((e) => `${e.date} ${e.time} ${e.period}`);
    const bestData = entries.map((e) => e.best);

    const pointColors = entries.map((e) => {
      const z = zoneFor(e.best, zones);
      if (z === "green") return "#2e7d32";
      if (z === "yellow") return "#b8860b";
      return "#c62828";
    });
    const pointStyles = entries.map((e) => (e.afterRescue ? "triangle" : "circle"));
    const pointRadii = entries.map((e) => (e.afterRescue ? 7 : 4));

    const yMax = Math.max(zones.green.max, ...bestData) + 20;
    const yMin = Math.max(0, Math.min(zones.red.max, ...bestData) - 30);

    if (chartInstance) {
      chartInstance.destroy();
    }

    chartInstance = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Best reading (L/min)",
            data: bestData,
            borderColor: "#2563eb",
            backgroundColor: "#2563eb",
            pointBackgroundColor: pointColors,
            pointBorderColor: pointColors,
            pointStyle: pointStyles,
            pointRadius: pointRadii,
            tension: 0.25,
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        scales: {
          y: {
            min: yMin,
            max: yMax,
            title: { display: true, text: "L/min" },
          },
          x: {
            ticks: { maxRotation: 60, minRotation: 45, autoSkip: true },
          },
        },
        plugins: {
          zoneBands: { zones },
          legend: { display: false },
        },
      },
      plugins: [zoneBandsPlugin],
    });
  }

  function symptomSearchTerms(entry) {
    const symptoms = entry.symptoms || {};
    const terms = [];
    if (symptoms.cough) terms.push("cough");
    if (symptoms.wheeze) terms.push("wheeze");
    if (symptoms.nighttimeAwakening) terms.push("nighttime awakening", "night waking");
    return terms.join(" ");
  }

  function applyFilters(entries) {
    return entries.filter((e) => {
      if (state.filterZone !== "all" && zoneFor(e.best, state.config.zones) !== state.filterZone) {
        return false;
      }
      if (state.filterText) {
        const haystack = `${e.date} ${e.time} ${symptomSearchTerms(e)} ${(e.symptoms && e.symptoms.notes) || ""}`.toLowerCase();
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

  function renderPagination(totalItems, totalPages) {
    document.getElementById("page-info").textContent = `Page ${state.page} of ${totalPages} (${totalItems} total)`;
    document.getElementById("page-prev").disabled = state.page <= 1;
    document.getElementById("page-next").disabled = state.page >= totalPages;
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
      emptyRow.innerHTML = `<td colspan="7" class="empty-state">No readings match the current filter.</td>`;
      tbody.appendChild(emptyRow);
      renderPagination(totalItems, totalPages);
      return;
    }

    const start = (state.page - 1) * state.pageSize;
    const pageItems = sorted.slice(start, start + state.pageSize);

    pageItems.forEach((e) => {
      const zone = zoneFor(e.best, state.config.zones);
      const symptomList = ["cough", "wheeze", "nighttimeAwakening"]
        .filter((s) => e.symptoms && e.symptoms[s])
        .map((s) => (s === "nighttimeAwakening" ? "Night waking" : s[0].toUpperCase() + s.slice(1)))
        .join(", ");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${e.date} ${e.time} ${e.period}</td>
        <td>${e.readings.join(" / ")}</td>
        <td><strong>${e.best}</strong></td>
        <td><span class="zone-pill ${zone}">${zone}</span></td>
        <td>${e.afterRescue ? `<span class="rescue-badge">▲ Yes</span>` : "No"}</td>
        <td>${symptomList || "—"}</td>
        <td class="notes-cell">${e.symptoms && e.symptoms.notes ? e.symptoms.notes : "—"}</td>
      `;
      tbody.appendChild(tr);
    });

    renderPagination(totalItems, totalPages);
  }

  function updateSortIndicators() {
    document.querySelectorAll("table.history th[data-key]").forEach((th) => {
      th.classList.toggle("sorted", th.dataset.key === state.sortKey);
    });
  }

  function wireControls() {
    document.getElementById("zone-filter").addEventListener("change", (ev) => {
      state.filterZone = ev.target.value;
      state.page = 1;
      renderTable();
    });
    document.getElementById("text-filter").addEventListener("input", (ev) => {
      state.filterText = ev.target.value;
      state.page = 1;
      renderTable();
    });
    document.getElementById("page-prev").addEventListener("click", () => {
      state.page -= 1;
      renderTable();
    });
    document.getElementById("page-next").addEventListener("click", () => {
      state.page += 1;
      renderTable();
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

  async function init() {
    try {
      const { entries, config } = await loadData();
      state.entries = entries;
      state.config = config;

      renderStats(computeStats(entries, config));
      renderChart(entries, config);
      wireControls();
      updateSortIndicators();
      renderTable();
    } catch (err) {
      console.error("Failed to load peak flow data", err);
      const main = document.querySelector("main");
      main.innerHTML = `<div class="card empty-state">Couldn't load reading data. If you're viewing this locally, serve the folder over HTTP rather than opening index.html directly.</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
