(function () {
  "use strict";

  // This repo's owner/name — used to build the GitHub "new issue" URL.
  const OWNER = "jeffpaul";
  const REPO = "peak-flow-tracker";

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

  function buildIssueUrl(fields) {
    const params = new URLSearchParams();
    params.set("template", "reading.yml");
    Object.entries(fields).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") return;
      params.set(key, value);
    });
    return `https://github.com/${OWNER}/${REPO}/issues/new?${params.toString()}`;
  }

  function checkedSymptomLabels(form) {
    return Array.from(form.querySelectorAll('input[name="symptom"]:checked')).map((el) => el.value);
  }

  function init() {
    const form = document.getElementById("log-form");
    const entryDateTime = document.getElementById("entryDateTime");
    const afterRescueSelect = document.getElementById("afterRescue");
    const afterFields = document.getElementById("after-rescue-fields");

    entryDateTime.value = nowLocalDatetimeValue();

    afterFields.hidden = afterRescueSelect.value !== "Yes";
    afterRescueSelect.addEventListener("change", () => {
      afterFields.hidden = afterRescueSelect.value !== "Yes";
    });

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();

      const dt = entryDateTime.value; // "YYYY-MM-DDTHH:MM"
      if (!dt) return;
      const [datePart, timePart] = dt.split("T");
      const [hh, mm] = timePart.split(":").map(Number);
      const { hour12, period } = to12Hour(hh);

      const url = buildIssueUrl({
        date: datePart,
        time: `${pad2(hour12)}:${pad2(mm)}`,
        period,
        reading1: document.getElementById("reading1").value,
        reading2: document.getElementById("reading2").value,
        reading3: document.getElementById("reading3").value,
        beforeRescue: document.getElementById("beforeRescue").value,
        afterRescue: afterRescueSelect.value,
        afterReading1: document.getElementById("afterReading1").value,
        afterReading2: document.getElementById("afterReading2").value,
        afterReading3: document.getElementById("afterReading3").value,
        symptoms: checkedSymptomLabels(form).join(", "),
        notes: document.getElementById("notes").value,
      });

      window.location.href = url;
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
