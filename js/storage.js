/*
  storage.js — saving and loading.

  Everything is stored in the browser's localStorage under one key, as JSON text.
  There is no server and no database, so nobody else can ever see this data.

  The "state" object holds everything the app knows:
  {
    start: 500,                       // money you started the month with
    monthStart: "2026-10-31",         // when this month began
    entries: [ { id, type, amt, catId, place, note, date } ],
    categories: { spend: [ {id, key, name, emoji, color} ], add: [ ... ] },
    places: { catId: ["Sonic", "McDonald's"] },                   // remembered places, newest first
    months: [ { monthStart, start, added, spent, end, top } ],   // past months
    settings: { theme: "blush", lang: "en" },
    setupDone: false                  // false = show the welcome screen
  }
*/

const STORAGE_KEY = "spend-diary-v1";

// Colors and emojis people can pick for a category.
const CAT_COLORS = ["#f39ab2", "#b8a6f0", "#7fd1ae", "#f7c08a", "#8ec5f5", "#f5a3d6", "#a7d97f", "#f2d17a", "#c9b8c6"];
const CAT_EMOJIS = ["🛒","🍔","⛽","💡","🏠","🧸","🛍️","🎉","📺","✨","☕","🐶","💊","🚗","📱","💅","🎮","✈️","🎁","💼","💵","🏋️","📚","🍷"];

// Starter categories. "key" lets us translate their names; custom ones have key: null.
function defaultCategories() {
  const make = (key, emoji, color) => ({ id: key, key, name: "", emoji, color });
  return {
    spend: [
      make("food", "🛒", "#f7c08a"), make("eatout", "🍔", "#f39ab2"), make("gas", "⛽", "#8ec5f5"),
      make("bills", "💡", "#f2d17a"), make("rent", "🏠", "#b8a6f0"), make("kids", "🧸", "#7fd1ae"),
      make("shopping", "🛍️", "#f5a3d6"), make("fun", "🎉", "#a7d97f"), make("subs", "📺", "#8ec5f5"),
      make("other", "✨", "#c9b8c6")
    ],
    add: [
      make("pay", "💼", "#7fd1ae"), make("side", "🚗", "#a7d97f"), make("gift", "🎁", "#f39ab2"),
      make("refund", "↩️", "#8ec5f5"), make("otherin", "✨", "#c9b8c6")
    ]
  };
}

// Today as "2026-10-31" in YOUR time zone.
// (toISOString() would use UTC, which can already be "tomorrow" in the evening in US time zones.)
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function freshState(lang = detectLanguage()) {
  return {
    start: 0,
    monthStart: todayISO(),
    entries: [],
    categories: defaultCategories(),
    places: {},
    months: [],
    settings: { theme: "blush", lang },
    setupDone: false
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return freshState();
    return cleanState(JSON.parse(saved)) || freshState();
  } catch (err) {
    // localStorage can be blocked (some private-browsing modes). Start fresh instead of crashing.
    return freshState();
  }
}

// Returns true if it saved, false if the browser refused.
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    return false;
  }
}

/*
  cleanState() checks data before we trust it — both what we load from storage
  and backup files people restore. Anything with the wrong shape is thrown out,
  so a broken or tampered file can't break the app.
*/
function cleanState(data) {
  if (!data || typeof data !== "object") return null;

  const isNum = v => typeof v === "number" && Number.isFinite(v);
  const isText = (v, max = 60) => typeof v === "string" && v.length <= max;
  const isDate = v => typeof v === "string" && !Number.isNaN(Date.parse(v));
  const isColor = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);          // exactly like #f39ab2
  const isEmoji = v => typeof v === "string" && /^[^<>&"'\s]{1,8}$/.test(v);       // short, no HTML characters

  if (!isNum(data.start)) return null;

  const cleanCat = c => (c && isText(c.id, 40) && isText(c.name || "", 30) && isEmoji(c.emoji) && isColor(c.color))
    ? { id: c.id, key: isText(c.key, 20) ? c.key : null, name: c.name || "", emoji: c.emoji, color: c.color }
    : null;

  const cats = data.categories || {};
  const categories = {
    spend: (Array.isArray(cats.spend) ? cats.spend.map(cleanCat).filter(Boolean) : []),
    add:   (Array.isArray(cats.add)   ? cats.add.map(cleanCat).filter(Boolean)   : [])
  };
  // Every list needs at least one category to pick from.
  const defaults = defaultCategories();
  if (!categories.spend.length) categories.spend = defaults.spend;
  if (!categories.add.length) categories.add = defaults.add;

  const entries = (Array.isArray(data.entries) ? data.entries : [])
    .filter(e => e && (e.type === "spend" || e.type === "add") && isNum(e.amt) && e.amt > 0
              && isText(e.catId, 40) && isText(e.place || "", 30) && isText(e.note || "") && isDate(e.date))
    .map(e => ({ id: isText(e.id, 40) ? e.id : makeId(), type: e.type, amt: round2(e.amt),
                 catId: e.catId, place: e.place || "", note: e.note || "", date: e.date }));

  // Remembered places: { catId: [up to 12 short names] }
  const places = {};
  for (const [catId, list] of Object.entries(data.places || {})) {
    if (isText(catId, 40) && Array.isArray(list)) {
      places[catId] = list.filter(name => isText(name, 30) && name.trim()).slice(0, 12);
    }
  }

  const months = (Array.isArray(data.months) ? data.months : [])
    .filter(m => m && isDate(m.monthStart) && [m.start, m.added, m.spent, m.end].every(isNum))
    .map(m => ({ monthStart: m.monthStart, start: m.start, added: m.added, spent: m.spent, end: m.end,
                 top: isText(m.top || "") ? (m.top || "") : "" }));

  const s = data.settings || {};
  return {
    start: round2(data.start),
    monthStart: isDate(data.monthStart) ? data.monthStart : todayISO(),
    entries,
    categories,
    places,
    months,
    settings: {
      theme: ["blush", "sage", "midnight"].includes(s.theme) ? s.theme : "blush",
      lang: s.lang === "es" ? "es" : "en"
    },
    setupDone: data.setupDone === true
  };
}

// A short random id like "lq8x2k9ab". Good enough for one person's data.
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}