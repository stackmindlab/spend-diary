/*
  helpers.js — small tools used by every other file.
*/

// Shortcut: $("balance") instead of document.getElementById("balance")
const $ = (id) => document.getElementById(id);

/*
  escapeHTML() — SECURITY.
  We build parts of the page with innerHTML. If someone typed a note like
  <img src=x onerror=alert(1)>, the browser would run it. Escaping turns
  < > & " ' into harmless text so user typing is always shown, never run.
  (This kind of attack is called XSS — cross-site scripting.)
*/
function escapeHTML(text) {
  return String(text).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
}

// 1234.5 → "$1,234.50"   -20 → "-$20.00"
function formatMoney(n) {
  const sign = n < 0 ? "-" : "";
  return (
    sign +
    "$" +
    Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

// Money math with decimals can drift (0.1 + 0.2 = 0.30000000000000004), so we round to cents.
function round2(n) {
  return Math.round(n * 100) / 100;
}

// Dates in the current language: "Sat, Oct 31" / "sáb, 31 oct"
function formatDate(date, options) {
  return new Date(date).toLocaleDateString(
    currentLang === "es" ? "es-US" : "en-US",
    options,
  );
}

// Turns whatever someone typed in an amount box into a number (or NaN).
function parseAmount(text) {
  return round2(parseFloat(String(text).replace(/[^\d.]/g, "")));
}
