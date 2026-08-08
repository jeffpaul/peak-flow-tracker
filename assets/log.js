(function () {
  "use strict";

  // This repo's owner/name — used to build the GitHub "new issue" URL.
  const OWNER = "jeffpaul";
  const REPO = "peak-flow-tracker";

  const READING_MIN = 60;
  const READING_MAX = 800;

  let configZones = null;

  const form = document.getElementById("log-form");
  const entryDateTime = document.getElementById("entryDateTime");
  const afterRescueCheckbox = document.getElementById("afterRescue");
  const notesInput = document.getElementById("notes");

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function to12Hour(hour24) {
    const period = hour24 >= 12 ? "PM" : "AM";
    let hour12 = hour24 % 12;
    if (hour12 === 0) hour12 = 12;
    return { hour12, period };
  }

  function nowLocalDatetimeValue() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
  }

  function formatLocalDatetime(dt) {
    const [datePart, timePart] = dt.split("T");
    const [hh, mm] = timePart.split(":").map(Number);
    const { hour12, period } = to12Hour(hh);
    return `${datePart} ${pad2(hour12)}:${pad2(mm)} ${period}`;
  }

  function buildIssueUrl(fields) {
    const params = new URLSearchParams();
    params.set("template", "reading.yml");
    Object.entries(fields).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") return;
      params.set(key, value);
    });
    return `https://github.com/${OWNER}/${REPO}/issues/new?${params.toString()}`;
  }

  function checkedSymptomLabels() {
    return Array.from(form.querySelectorAll('input[name="symptom"]:checked')).map((el) => el.value);
  }

  async function loadConfig() {
    try {
      const res = await fetch("data/config.json", { cache: "no-store" });
      const cfg = await res.json();
      configZones = cfg.zones || null;
    } catch (e) {
      configZones = null;
    }
    updatePreview();
  }

  function zoneFor(value) {
    if (!configZones || value === null || value === undefined) return null;
    if (value >= configZones.green.min) return "green";
    if (value >= configZones.yellow.min) return "yellow";
    return "red";
  }

  function readReadings() {
    return [1, 2, 3].map((i) => {
      const el = document.getElementById(`reading${i}`);
      const raw = el.value.trim();
      return raw === "" ? null : Number(raw);
    });
  }

  function setText(id, text) {
    document.getElementById(id).textContent = text;
  }

  function updatePreview() {
    const dt = entryDateTime.value;
    const readings = readReadings();
    const nums = readings.filter((n) => n !== null);
    const best = nums.length ? Math.max(...nums) : null;
    const zone = best !== null ? zoneFor(best) : null;

    setText("preview-datetime", dt ? formatLocalDatetime(dt) : "—");
    setText("preview-readings", nums.length ? nums.join(" / ") : "—");
    setText("preview-best", best !== null ? `${best} L/min` : "—");

    const zoneEl = document.getElementById("preview-zone");
    zoneEl.textContent = zone ? zone : "—";
    zoneEl.className = `zone-pill${zone ? ` ${zone}` : ""}`;

    setText("preview-rescue", afterRescueCheckbox.checked ? "Yes" : "No");
    const syms = checkedSymptomLabels();
    setText("preview-symptoms", syms.length ? syms.join(", ") : "None");
    const notes = notesInput.value.trim();
    setText("preview-notes-line", notes ? `Notes: ${notes}` : "Notes: none");
  }

  /* -------------------------------- validation ------------------------------ */
  function setError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const input = field.querySelector("input");
    field.querySelectorAll(".field-error").forEach((n) => n.remove());
    if (message) {
      const err = document.createElement("p");
      err.className = "field-error";
      err.textContent = message;
      field.appendChild(err);
      if (input) {
        input.setAttribute("aria-invalid", "true");
        const errId = `${fieldId}-error`;
        err.id = errId;
        input.setAttribute("aria-describedby", errId);
      }
    } else if (input) {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }

  function announce(msg) {
    document.getElementById("live-region").textContent = msg;
  }

  function validate() {
    let firstInvalid = null;
    const errors = [];

    if (!entryDateTime.value) {
      setError("field-datetime", "Pick a date and time for this reading.");
      errors.push("date/time");
      firstInvalid = firstInvalid || entryDateTime;
    } else {
      setError("field-datetime");
    }

    const readings = readReadings();
    [1, 2, 3].forEach((i) => {
      const v = readings[i - 1];
      const el = document.getElementById(`reading${i}`);
      const fieldId = `field-reading${i}`;
      if (v === null) {
        setError(fieldId, `Reading ${i} is required — enter a value or leave it and re-check.`);
        errors.push(`reading ${i}`);
        firstInvalid = firstInvalid || el;
      } else if (!Number.isInteger(v)) {
        setError(fieldId, `Reading ${i} must be a whole number (L/min).`);
        errors.push(`reading ${i}`);
        firstInvalid = firstInvalid || el;
      } else if (v < READING_MIN || v > READING_MAX) {
        setError(fieldId, `Reading ${i} must be between ${READING_MIN} and ${READING_MAX} L/min.`);
        errors.push(`reading ${i}`);
        firstInvalid = firstInvalid || el;
      } else {
        setError(fieldId);
      }
    });

    if (errors.length) {
      announce(`Please fix: ${errors.join(", ")}.`);
      if (firstInvalid) firstInvalid.focus();
      return false;
    }
    return true;
  }

  function init() {
    wireTheme();

    entryDateTime.value = nowLocalDatetimeValue();

    ["entryDateTime", "reading1", "reading2", "reading3", "notes", "afterRescue"].forEach((id) => {
      document.getElementById(id).addEventListener("input", updatePreview);
    });
    form.querySelectorAll('input[name="symptom"]').forEach((el) => {
      el.addEventListener("change", updatePreview);
    });
    updatePreview();
    loadConfig();

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (!validate()) return;

      const dt = entryDateTime.value; // "YYYY-MM-DDTHH:MM"
      const [datePart, timePart] = dt.split("T");
      const [hh, mm] = timePart.split(":").map(Number);
      const { hour12, period } = to12Hour(hh);

      const readings = readReadings();
      const best = Math.max(...readings);

      const url = buildIssueUrl({
        date: datePart,
        time: `${pad2(hour12)}:${pad2(mm)}`,
        period,
        reading1: readings[0],
        reading2: readings[1],
        reading3: readings[2],
        afterRescue: afterRescueCheckbox.checked ? "Yes" : "No",
        symptoms: checkedSymptomLabels().join(", "),
        notes: notesInput.value.trim(),
      });

      announce(`Opening GitHub with your best reading of ${best} L/min — tap “Submit new issue” there to log it.`);
      window.location.href = url;
    });
  }

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
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
