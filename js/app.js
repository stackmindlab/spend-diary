/*
  app.js — the screen and the buttons.
 
  How it works, in one sentence:
  every action changes the `state` object → we save it → we call render(),
  which redraws the screen from `state`. The screen never holds data of its own.
*/

let state = loadState();

// Things that only matter while the page is open (not saved):
let mode = "spend"; // which tab is on: "spend" or "add"
let selectedCatId = null; // which category chip is picked
let historyShown = 15; // how many history rows to show
let lastBalance = null; // used to animate the balance number
let justAddedId = null; // the newest entry slides into History

/* ============ 1. SAVING ============ */

function save() {
  if (!saveState(state)) toast(t("saveFail"));
}

/* ============ 2. CATEGORY LOOKUPS ============ */

// The name to show: what they typed, or the translated starter name.
function catName(cat) {
  if (cat.name) return cat.name;
  return DEFAULT_CAT_NAMES[currentLang][cat.key] || cat.key || "?";
}

function findCat(id) {
  return (
    [...state.categories.spend, ...state.categories.add].find(
      (c) => c.id === id,
    ) || { id, key: null, name: "?", emoji: "•", color: "#ccc" }
  );
}

/* ============ 3. MATH ============ */

function totals() {
  let added = 0,
    spent = 0;
  const spentByCat = {},
    addedByCat = {};
  for (const e of state.entries) {
    if (e.type === "add") {
      added += e.amt;
      addedByCat[e.catId] = (addedByCat[e.catId] || 0) + e.amt;
    } else {
      spent += e.amt;
      spentByCat[e.catId] = (spentByCat[e.catId] || 0) + e.amt;
    }
  }
  return {
    added: round2(added),
    spent: round2(spent),
    left: round2(state.start + added - spent),
    spentByCat,
    addedByCat,
  };
}

// { catId: amount } → sorted rows ready for a chart, biggest first
function toRows(byCat) {
  return Object.entries(byCat)
    .map(([id, value]) => {
      const cat = findCat(id);
      return {
        id,
        value: round2(value),
        label: catName(cat),
        emoji: cat.emoji,
        color: cat.color,
      };
    })
    .sort((a, b) => b.value - a.value);
}

// "2026-10-31" style key in the person's own time zone
function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "2026-10-31" → a Date at local midnight (new Date("2026-10-31") would use UTC and can be off by a day)
function localDate(isoDay) {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Balance at the end of each day, from the start of the month until today.
// The first point is your starting amount, so even on day one there's a line to see.
function dailyBalances() {
  const changeByDay = {};
  for (const e of state.entries) {
    const k = dayKey(e.date);
    changeByDay[k] =
      (changeByDay[k] || 0) + (e.type === "add" ? e.amt : -e.amt);
  }
  const points = [{ label: t("startPoint"), value: round2(state.start) }];
  let balance = state.start;
  const day = localDate(state.monthStart);
  const today = new Date();
  while (day <= today && points.length < 62) {
    balance += changeByDay[dayKey(day)] || 0;
    points.push({
      label: formatDate(day, { month: "short", day: "numeric" }),
      value: round2(balance),
    });
    day.setDate(day.getDate() + 1);
  }
  return points;
}

// "2026-10-01" → "October 2026" / "Octubre 2026"
function monthTitle(isoDay) {
  const d = localDate(isoDay);
  const month = formatDate(d, { month: "long" });
  return month.charAt(0).toUpperCase() + month.slice(1) + " " + d.getFullYear();
}

/* ============ 4. DRAWING THE SCREEN ============ */

function render() {
  const sum = totals();

  $("monthLabel").textContent = monthTitle(state.monthStart);

  // Balance card (flashes green when it goes up, pink when it goes down)
  if (lastBalance !== null && sum.left !== lastBalance) {
    flash($("balance"), sum.left > lastBalance ? "flash-up" : "flash-down");
  }
  animateNumber($("balance"), lastBalance, sum.left);
  lastBalance = sum.left;
  $("balance").classList.toggle("negative", sum.left < 0);
  $("startAmount").textContent = formatMoney(state.start);
  $("addedAmount").textContent = formatMoney(sum.added);
  $("spentAmount").textContent = formatMoney(sum.spent);

  const pool = state.start + sum.added;
  const pctLeft =
    pool > 0 ? Math.max(0, Math.min(100, (sum.left / pool) * 100)) : 0;
  $("meterFill").style.width = pctLeft.toFixed(1) + "%";
  $("meterNote").textContent =
    pool <= 0
      ? ""
      : sum.left < 0
        ? t("overBy", { amt: formatMoney(-sum.left) })
        : t("stillHave", { pct: Math.round(pctLeft) });

  renderChips();
  renderSpendChart(sum);
  renderLineChart();
  renderIncomeChart(sum);
  renderHistory();
  renderPastMonths();
  animateBars();
}

function renderChips() {
  const list = state.categories[mode];
  if (!list.some((c) => c.id === selectedCatId)) selectedCatId = null;

  $("chips").innerHTML =
    list
      .map(
        (c) =>
          `<button class="chip ${c.id === selectedCatId ? "on" : ""}" data-id="${escapeHTML(c.id)}">${c.emoji} ${escapeHTML(catName(c))}</button>`,
      )
      .join("") +
    `<button class="chip new" id="newChip">${t("newCat")}</button>`;

  renderPlaceChips();
  $("catLabel").textContent = mode === "spend" ? t("whatFor") : t("whereFrom");
  $("goBtn").textContent = mode === "spend" ? t("subtract") : t("addIt");
  $("goBtn").className = "go " + mode;
  document
    .querySelectorAll(".seg button")
    .forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
}

function renderSpendChart(sum) {
  const rows = toRows(sum.spentByCat);
  if (!rows.length) {
    $("spendChart").innerHTML = `<p class="empty">${t("nothingSpent")}</p>`;
    return;
  }
  const top = rows[0];
  const topPct = Math.round((top.value / sum.spent) * 100) + "%";
  $("spendChart").innerHTML =
    `<div class="donut-wrap">${donutChart(rows, topPct, `${top.emoji} ${top.label}`)}</div>` +
    barList(rows, sum.spent) +
    `<p class="hint">👆 ${t("tapHint")}</p>` +
    `<div class="top-tip">${t("mostWent", { cat: `<b>${escapeHTML(top.label)}</b>`, amt: formatMoney(top.value) })}</div>` +
    topPlacesList();
}

/* Adds up money by place name. "sonic" and "Sonic" count as the same place. */
function totalsByPlace(entries) {
  const byPlace = {};
  for (const e of entries) {
    const name = e.place || t("noPlace");
    const key = name.toLowerCase();
    if (!byPlace[key]) byPlace[key] = { label: name, value: 0 };
    byPlace[key].value = round2(byPlace[key].value + e.amt);
  }
  return Object.values(byPlace).sort((a, b) => b.value - a.value);
}

// The 3 places you spent the most at this month (only entries that have a place).
function topPlacesList() {
  const spends = state.entries.filter((e) => e.type === "spend" && e.place);
  const top = totalsByPlace(spends).slice(0, 3);
  if (!top.length) return "";
  return (
    `<div class="top-places"><h4>📍 ${t("topPlaces")}</h4>` +
    top
      .map(
        (p) =>
          `<div class="place-row"><span>${escapeHTML(p.label)}</span><b>${formatMoney(p.value)}</b></div>`,
      )
      .join("") +
    `</div>`
  );
}

// Pop-up: one category broken down by place. Reuses barList from charts.js.
function openPlaceBreakdown(catId) {
  const cat = findCat(catId);
  const entries = state.entries.filter((e) => e.catId === catId);
  const total = round2(entries.reduce((sum, e) => sum + e.amt, 0));
  const rows = totalsByPlace(entries).map((p) => ({
    ...p,
    emoji: "📍",
    color: cat.color,
  }));
  openSheet(`
    <h3>${cat.emoji} ${escapeHTML(catName(cat))}: ${formatMoney(total)}</h3>
    ${barList(rows, total)}
    <div class="btns one"><button data-action="close">OK</button></div>`);
  animateBars();
}

function renderLineChart() {
  const points = dailyBalances();
  $("lineChart").innerHTML =
    state.entries.length && points.length
      ? lineChart(points)
      : `<p class="empty">${t("lineEmpty")}</p>`;
}

function renderIncomeChart(sum) {
  const rows = toRows(sum.addedByCat);
  $("incomeChart").innerHTML = rows.length
    ? barList(rows, sum.added)
    : `<p class="empty">${t("nothingAdded")}</p>`;
}

function renderHistory() {
  const newestFirst = [...state.entries].reverse(); // copy first so we don't flip the real list
  if (!newestFirst.length) {
    $("historyList").innerHTML = `<p class="empty">${t("noEntries")}</p>`;
    return;
  }
  const rows = newestFirst
    .slice(0, historyShown)
    .map((e) => {
      const cat = findCat(e.catId);
      const when = formatDate(e.date, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const sign = e.type === "add" ? "+" : "−";
      return `
      <div class="entry ${e.id === justAddedId ? "slide-in" : ""}" data-row="${escapeHTML(e.id)}">
        <div class="dot" style="background:${cat.color}">${cat.emoji}</div>
        <div class="info">
          <div class="name">${escapeHTML(catName(cat))}</div>
          <div class="sub">${[when, e.place, e.note].filter(Boolean).map(escapeHTML).join(" · ")}</div>
        </div>
        <div class="val ${e.type === "add" ? "in" : "out"}">${sign}${formatMoney(e.amt)}</div>
        <button class="x-btn" data-id="${escapeHTML(e.id)}" aria-label="${t("delete")}">×</button>
      </div>`;
    })
    .join("");
  const more =
    newestFirst.length > historyShown
      ? `<button class="more" id="moreBtn">${t("showMore")}</button>`
      : "";
  $("historyList").innerHTML = rows + more;
  justAddedId = null; // only slide in once
}

function renderPastMonths() {
  $("pastCard").hidden = state.months.length === 0;
  $("pastList").innerHTML = [...state.months]
    .reverse()
    .map(
      (m) => `
    <div class="entry">
      <div class="info">
        <div class="name">${monthTitle(m.monthStart)}</div>
        <div class="sub">${t("spentMost", { amt: formatMoney(m.spent), cat: escapeHTML(m.top || "—") })}</div>
      </div>
      <div class="val ${m.end < 0 ? "out" : "in"}">${formatMoney(m.end)} ${t("left")}</div>
    </div>`,
    )
    .join("");
}

// Counts the balance up/down smoothly instead of jumping.
function animateNumber(el, from, to) {
  if (
    from === null ||
    from === to ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    el.textContent = formatMoney(to);
    return;
  }
  const startTime = performance.now();
  const duration = 500;
  function step(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3); // fast at first, slow at the end
    el.textContent = formatMoney(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Bars are drawn at width 0, then grown on the next frame so CSS can animate them.
// Each bar waits a little longer than the one above it, so they grow one after another.
function animateBars() {
  requestAnimationFrame(() => {
    document.querySelectorAll(".bar i").forEach((bar, i) => {
      bar.style.transitionDelay = (i % 10) * 0.06 + "s";
      bar.style.width = bar.dataset.width + "%";
    });
  });
}

/* ---- Little animation helpers ---- */

const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

// Adds a CSS class for a moment so its animation plays, then removes it.
function flash(el, className) {
  el.classList.remove("flash-up", "flash-down");
  void el.offsetWidth; // restart the animation if it was already playing
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), 700);
}

// A short phone vibration (Android only — iPhones don't allow it for websites).
function buzz(ms = 15) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

// Sparkle burst: glowing dots and a few emoji fly out from an element, then fade away.
function sparkle(fromEl) {
  if (reducedMotion()) return;
  const box = fromEl.getBoundingClientRect();
  const colors = ["var(--good)", "var(--accent)", "var(--bad)", "#f7c08a"];
  const emojis = ["✨", "💸", "⭐", "💚"];
  for (let i = 0; i < 18; i++) {
    const piece = document.createElement("span");
    const angle = (i / 18) * Math.PI * 2;
    const distance = 70 + Math.random() * 60;
    if (i % 3 === 0) {
      piece.className = "spark emoji"; // every 3rd piece is an emoji
      piece.textContent = emojis[(i / 3) % emojis.length];
    } else {
      piece.className = "spark";
      piece.style.background = colors[i % colors.length];
    }
    piece.style.left = box.left + box.width / 2 + "px";
    piece.style.top = box.top + box.height / 2 + "px";
    piece.style.setProperty("--x", Math.cos(angle) * distance + "px");
    piece.style.setProperty("--y", Math.sin(angle) * distance + "px");
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 1000);
  }
}

/* ============ 5. TOAST + POP-UP SHEET ============ */

let toastTimer;
function toast(message, buttonText = "", onButton = null) {
  $("toastText").textContent = message;
  $("toastBtn").textContent = buttonText;
  $("toastBtn").onclick = () => {
    if (onButton) onButton();
    $("toast").classList.remove("show");
  };
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => $("toast").classList.remove("show"),
    buttonText ? 5000 : 2200,
  );
}

/*
  openSheet(html, actions)
  Any button inside the sheet with data-action="name" runs actions.name(button).
  This keeps every pop-up's buttons in one small object instead of many listeners.
*/
let sheetActions = {};
let sheetLocked = false; // the welcome screen can't be closed by tapping outside

function openSheet(html, actions = {}, locked = false) {
  $("sheet").innerHTML = html;
  sheetActions = actions;
  sheetLocked = locked;
  $("sheetBg").classList.add("show");
}
function closeSheet() {
  $("sheetBg").classList.remove("show");
}
$("sheet").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = sheetActions[button.dataset.action];
  if (action) action(button);
  else closeSheet(); // buttons like "Cancel" have no action → just close
});
$("sheetBg").addEventListener("click", (event) => {
  if (event.target.id === "sheetBg" && !sheetLocked) closeSheet();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !sheetLocked) closeSheet();
});

const cancelSaveButtons = (saveText = t("save"), style = "primary") =>
  `<div class="btns"><button data-action="cancel">${t("cancel")}</button><button class="${style}" data-action="ok">${saveText}</button></div>`;

/* ============ 6. LOGGING MONEY ============ */

document.querySelector(".seg").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  mode = button.dataset.mode;
  selectedCatId = null;
  $("errorText").textContent = "";
  renderChips();
});

$("chips").addEventListener("click", (event) => {
  if (event.target.closest("#newChip")) return openCategoryEditor(mode, null);
  const chip = event.target.closest(".chip");
  if (!chip) return;
  selectedCatId = chip.dataset.id;
  $("errorText").textContent = "";
  renderChips();
});

// Tap a category row in "Where it went" / "Where it came from" → see it by place.
["spendChart", "incomeChart"].forEach((id) => {
  $(id).addEventListener("click", (event) => {
    const row = event.target.closest(".bar-row[data-id]");
    if (row) openPlaceBreakdown(row.dataset.id);
  });
  $(id).addEventListener("keydown", (event) => {
    const row = event.target.closest(".bar-row[data-id]");
    if (row && event.key === "Enter") openPlaceBreakdown(row.dataset.id);
  });
});

/* ---- "Where?" box: remembers places for each category ---- */

// If you typed "sonic" but already saved "Sonic", use the saved spelling.
function matchSavedPlace(catId, typed) {
  const saved = state.places[catId] || [];
  return saved.find((p) => p.toLowerCase() === typed.toLowerCase()) || typed;
}

// Puts a place at the front of that category's list (no duplicates, max 12).
function rememberPlace(catId, place) {
  const others = (state.places[catId] || []).filter(
    (p) => p.toLowerCase() !== place.toLowerCase(),
  );
  state.places[catId] = [place, ...others].slice(0, 12);
}

// Shows up to 6 tappable suggestions for the picked category, filtered by what's typed.
function renderPlaceChips() {
  const typed = $("placeInput").value.trim().toLowerCase();
  const saved = selectedCatId ? state.places[selectedCatId] || [] : [];
  const matches = saved
    .filter(
      (p) => p.toLowerCase().startsWith(typed) && p.toLowerCase() !== typed,
    )
    .slice(0, 6);
  $("placeChips").innerHTML = matches
    .map(
      (p) =>
        `<button class="place-chip" data-place="${escapeHTML(p)}">📍 ${escapeHTML(p)}</button>`,
    )
    .join("");
}

$("placeInput").addEventListener("input", renderPlaceChips);
$("placeChips").addEventListener("click", (event) => {
  const chip = event.target.closest(".place-chip");
  if (!chip) return;
  $("placeInput").value = chip.dataset.place;
  renderPlaceChips();
});

// Only allow numbers and one dot, with at most 2 decimals.
$("amountInput").addEventListener("input", (event) => {
  let v = event.target.value.replace(/[^\d.]/g, "");
  const dot = v.indexOf(".");
  if (dot !== -1)
    v =
      v.slice(0, dot + 1) +
      v
        .slice(dot + 1)
        .replace(/\./g, "")
        .slice(0, 2);
  event.target.value = v.slice(0, 10);
});

function showError(message) {
  $("errorText").textContent = message;
  const card = $("entryCard");
  card.classList.remove("shake");
  void card.offsetWidth; // restarts the animation (forces the browser to notice)
  card.classList.add("shake");
}

function logEntry() {
  const amt = parseAmount($("amountInput").value);
  if (!amt || amt <= 0) return showError(t("errAmount"));
  if (!selectedCatId) return showError(t("errCat"));

  const place = matchSavedPlace(
    selectedCatId,
    $("placeInput").value.trim().slice(0, 30),
  );
  state.entries.push({
    id: makeId(),
    type: mode,
    amt,
    catId: selectedCatId,
    place,
    note: $("noteInput").value.trim().slice(0, 60),
    date: new Date().toISOString(),
  });
  if (place) rememberPlace(selectedCatId, place);
  justAddedId = state.entries[state.entries.length - 1].id;
  save();
  buzz();
  if (mode === "add") sparkle($("balance")); // 🎉 money in!

  $("amountInput").value = "";
  $("placeInput").value = "";
  $("noteInput").value = "";
  selectedCatId = null;
  $("errorText").textContent = "";
  render();
  toast(
    mode === "spend"
      ? t("loggedSpend", { amt: formatMoney(amt) })
      : t("loggedAdd", { amt: formatMoney(amt) }),
  );
}

$("goBtn").addEventListener("click", logEntry);
["amountInput", "placeInput", "noteInput"].forEach((id) =>
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      logEntry();
    }
  }),
);

/* ============ 7. HISTORY: DELETE + UNDO ============ */

$("historyList").addEventListener("click", (event) => {
  if (event.target.id === "moreBtn") {
    historyShown += 20;
    renderHistory();
    return;
  }
  const button = event.target.closest(".x-btn");
  if (!button) return;

  const index = state.entries.findIndex((e) => e.id === button.dataset.id);
  if (index === -1) return;
  buzz(30);

  // Play the slide-out animation first, THEN remove it from the data.
  button.closest(".entry").classList.add("slide-out");
  setTimeout(
    () => {
      const [removed] = state.entries.splice(index, 1);
      save();
      render();
      toast(
        t("deleted", { cat: catName(findCat(removed.catId)) }),
        t("undo"),
        () => {
          state.entries.splice(index, 0, removed); // put it back exactly where it was
          justAddedId = removed.id; // and slide it back in
          buzz();
          save();
          render();
        },
      );
    },
    reducedMotion() ? 0 : 280,
  );
});

/* ============ 8. STARTING AMOUNT ============ */

$("editStart").addEventListener("click", () => {
  openSheet(
    `
    <h3>${t("startTitle")}</h3>
    <p>${t("startQ")}</p>
    <label class="amount"><span>$</span><input id="startInput" type="text" inputmode="decimal" value="${state.start}"></label>
    ${cancelSaveButtons()}`,
    {
      ok: () => {
        const value = parseAmount($("startInput").value);
        if (Number.isNaN(value)) return;
        state.start = value;
        save();
        render();
        closeSheet();
        toast(t("startUpdated"));
      },
    },
  );
  setTimeout(() => $("startInput").select(), 300);
});

/* ============ 9. CATEGORIES ============ */

$("manageCats").addEventListener("click", openCategoryManager);

function openCategoryManager() {
  const section = (type) => `
    <h4>${type === "spend" ? t("spendingCats") : t("incomeCats")}</h4>
    ${state.categories[type]
      .map(
        (c) => `
      <div class="cat-row">
        <span>${c.emoji}</span>
        <span class="name">${escapeHTML(catName(c))}</span>
        <button class="small-btn" data-action="edit" data-type="${type}" data-id="${escapeHTML(c.id)}">${t("edit")}</button>
      </div>`,
      )
      .join("")}
    <button class="menu-item" data-action="add" data-type="${type}">${t("addCat")}</button>`;

  openSheet(`<h3>${t("categories")}</h3>${section("spend")}${section("add")}`, {
    edit: (btn) => openCategoryEditor(btn.dataset.type, btn.dataset.id),
    add: (btn) => openCategoryEditor(btn.dataset.type, null),
  });
}

// Used for both "new" (id = null) and "edit".
function openCategoryEditor(type, id) {
  const existing = id ? state.categories[type].find((c) => c.id === id) : null;
  const draft = {
    name: existing ? catName(existing) : "",
    emoji: existing ? existing.emoji : CAT_EMOJIS[0],
    color: existing ? existing.color : CAT_COLORS[0],
  };

  const draw = () =>
    openSheet(
      `
    <h3>${existing ? t("editCatTitle") : t("newCatTitle")}</h3>
    <h4>${t("catName")}</h4>
    <input class="text-input" id="catNameInput" maxlength="30" placeholder="${t("catNamePh")}" value="${escapeHTML(draft.name)}">
    <p class="err" id="catError"></p>
    <h4>${t("pickEmoji")}</h4>
    <div class="emoji-grid">${CAT_EMOJIS.map((e) => `<button class="${e === draft.emoji ? "on" : ""}" data-action="emoji" data-value="${e}">${e}</button>`).join("")}</div>
    <h4>${t("pickColor")}</h4>
    <div class="color-grid">${CAT_COLORS.map((c) => `<button class="${c === draft.color ? "on" : ""}" style="background:${c}" data-action="color" data-value="${c}" aria-label="${c}"></button>`).join("")}</div>
    ${existing ? `<button class="menu-item danger" data-action="remove">🗑️ ${t("delete")}</button>` : ""}
    ${cancelSaveButtons()}`,
      {
        // Picking an emoji/color redraws the sheet, so remember what was typed first.
        emoji: (btn) => {
          draft.name = $("catNameInput").value;
          draft.emoji = btn.dataset.value;
          draw();
        },
        color: (btn) => {
          draft.name = $("catNameInput").value;
          draft.color = btn.dataset.value;
          draw();
        },
        remove: () => deleteCategory(type, existing),
        ok: () => {
          const name = $("catNameInput").value.trim();
          if (!name) {
            $("catError").textContent = t("errName");
            return;
          }
          const duplicate = state.categories[type].some(
            (c) =>
              c !== existing && catName(c).toLowerCase() === name.toLowerCase(),
          );
          if (duplicate) {
            $("catError").textContent = t("errDup");
            return;
          }

          if (existing) {
            // Keep the starter name translatable if they didn't actually change it.
            if (name !== catName(existing)) existing.name = name;
            existing.emoji = draft.emoji;
            existing.color = draft.color;
          } else {
            const cat = {
              id: makeId(),
              key: null,
              name,
              emoji: draft.emoji,
              color: draft.color,
            };
            state.categories[type].push(cat);
            if (type === mode) selectedCatId = cat.id; // pick the new one right away
          }
          save();
          render();
          closeSheet();
          toast(t("catSaved"));
        },
      },
    );
  draw();
}

function deleteCategory(type, cat) {
  const others = state.categories[type].filter((c) => c.id !== cat.id);
  if (!others.length) {
    $("catError").textContent = t("lastCat");
    return;
  }

  const used = state.entries.filter((e) => e.catId === cat.id);
  const remove = () => {
    state.categories[type] = others;
    save();
    render();
    closeSheet();
    toast(t("catDeleted"));
  };

  // No entries use it → just delete. Otherwise ask where those entries should go.
  if (!used.length) return remove();

  const total = round2(used.reduce((sum, e) => sum + e.amt, 0));
  openSheet(
    `
    <h3>${t("delete")} ${cat.emoji} ${escapeHTML(catName(cat))}</h3>
    <p>${escapeHTML(t("moveQ", { cat: catName(cat), n: used.length, amt: formatMoney(total) }))}</p>
    <div class="chips">${others.map((c) => `<button class="chip" data-action="moveTo" data-id="${escapeHTML(c.id)}">${c.emoji} ${escapeHTML(catName(c))}</button>`).join("")}</div>
    <div class="btns one"><button data-action="cancel">${t("cancel")}</button></div>`,
    {
      moveTo: (btn) => {
        used.forEach((e) => {
          e.catId = btn.dataset.id;
        });
        remove();
      },
    },
  );
}

/* ============ 10. MENU ============ */

$("menuBtn").addEventListener("click", openMenu);

function openMenu() {
  const sum = totals();
  const themes = ["blush", "sage", "midnight"];
  const themeIcons = { blush: "🌸", sage: "🌿", midnight: "🌙" };

  openSheet(
    `
    <h3>${t("menu")}</h3>
    <p>${t("menuNote")}</p>
    <h4>${t("theme")}</h4>
    <div class="toggle-row">${themes
      .map(
        (th) =>
          `<button class="${state.settings.theme === th ? "on" : ""}" data-action="theme" data-value="${th}">${themeIcons[th]} ${t(th)}</button>`,
      )
      .join("")}</div>
    <h4>${t("language")}</h4>
    <div class="toggle-row">
      <button class="${currentLang === "en" ? "on" : ""}" data-action="lang" data-value="en">English</button>
      <button class="${currentLang === "es" ? "on" : ""}" data-action="lang" data-value="es">Español</button>
    </div>
    <h4>&nbsp;</h4>
    <button class="menu-item" data-action="cats">🏷️ <span>${t("categories")}<small>${t("categoriesSub")}</small></span></button>
    <button class="menu-item" data-action="month">🌙 <span>${t("newMonth")}<small>${t("newMonthSub", { amt: formatMoney(sum.left) })}</small></span></button>
    <button class="menu-item" data-action="move">📲 <span>${t("move")}<small>${t("moveSub")}</small></span></button>
    <button class="menu-item danger" data-action="erase">🗑️ <span>${t("eraseAll")}<small>${t("eraseSub")}</small></span></button>`,
    {
      theme: (btn) => {
        setTheme(btn.dataset.value);
        openMenu();
      },
      lang: (btn) => {
        setLanguage(btn.dataset.value);
        openMenu();
      },
      cats: openCategoryManager,
      month: confirmNewMonth,
      move: openMoveSheet,
      erase: confirmErase,
    },
  );
}

function setTheme(theme) {
  state.settings.theme = theme;
  // View Transitions: the browser cross-fades the old look into the new one.
  // Browsers that don't support it (or reduced motion) just switch instantly.
  const apply = () => {
    document.documentElement.dataset.theme = theme;
  };
  if (document.startViewTransition && !reducedMotion())
    document.startViewTransition(apply);
  else apply();
  // Color of the phone's top bar
  const bar = { blush: "#f6e7f0", sage: "#eef0e6", midnight: "#0f1424" }[theme];
  document.querySelector('meta[name="theme-color"]').content = bar;
  save();
}

function setLanguage(lang) {
  state.settings.lang = lang;
  applyLanguage(lang);
  save();
  render();
}

function confirmNewMonth() {
  const sum = totals();
  openSheet(
    `<h3>${t("newMonthQ")}</h3><p>${t("newMonthBody", { amt: formatMoney(sum.left) })}</p>${cancelSaveButtons(t("startFresh"))}`,
    {
      ok: () => {
        const top = toRows(sum.spentByCat)[0];
        state.months.push({
          monthStart: state.monthStart,
          start: state.start,
          added: sum.added,
          spent: sum.spent,
          end: sum.left,
          top: top ? top.label : "",
        });
        state.start = sum.left;
        state.monthStart = todayISO();
        state.entries = [];
        historyShown = 15;
        lastBalance = null;
        save();
        render();
        closeSheet();
        toast(t("freshToast"));
      },
    },
  );
}

function confirmErase() {
  openSheet(
    `<h3>${t("eraseQ")}</h3><p>${t("eraseBody")}</p>${cancelSaveButtons(t("erase"), "danger")}`,
    {
      ok: () => {
        const { theme, lang } = state.settings; // keep their look + language
        state = freshState(lang);
        state.settings.theme = theme;
        lastBalance = null;
        save();
        closeSheet();
        render();
        toast(t("erased"));
        showWelcome();
      },
    },
  );
}

/* ============ 11. MOVE TO ANOTHER DEVICE (backup / restore) ============ */

function openMoveSheet() {
  openSheet(
    `
    <h3>${t("moveTitle")}</h3>
    <p>${t("moveBody")}</p>
    <div class="btns">
      <button class="primary" data-action="backup">💾 ${t("backup")}</button>
      <button data-action="restore">📂 ${t("restore")}</button>
    </div>`,
    {
      backup: () => {
        downloadBackup();
        closeSheet();
      },
      restore: () => {
        closeSheet();
        $("restoreFile").click();
      },
    },
  );
}

// Makes a .json file in memory and "clicks" a hidden download link.
function downloadBackup() {
  const file = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `spend-diary-backup-${todayISO()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t("backupDone"));
}

$("restoreFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = ""; // so picking the same file again still works
  if (!file) return;
  try {
    if (file.size > 2000000) throw new Error("too big");
    const data = cleanState(JSON.parse(await file.text())); // never trust a file without checking it
    if (!data) throw new Error("wrong shape");
    openSheet(
      `<h3>${t("restoreQ")}</h3><p>${t("restoreBody", { n: data.entries.length })}</p>${cancelSaveButtons(t("restore"))}`,
      {
        ok: () => {
          state = data;
          state.setupDone = true;
          applyLanguage(state.settings.lang);
          setTheme(state.settings.theme);
          lastBalance = null;
          save();
          render();
          closeSheet();
          toast(t("restored"));
        },
      },
    );
  } catch (err) {
    toast(t("badFile"));
  }
});

/* ============ 12. WELCOME SCREEN (first visit) ============ */

function showWelcome() {
  const typed = $("welcomeInput") ? $("welcomeInput").value : "";
  const themeIcons = { blush: "🌸", sage: "🌿", midnight: "🌙" };
  openSheet(
    `
    <h3>${t("welcome")}</h3>
    <p>${t("welcomeBody")}</p>
    <div class="toggle-row">
      <button class="${currentLang === "en" ? "on" : ""}" data-action="lang" data-value="en">English</button>
      <button class="${currentLang === "es" ? "on" : ""}" data-action="lang" data-value="es">Español</button>
    </div>
    <div class="toggle-row">${["blush", "sage", "midnight"]
      .map(
        (th) =>
          `<button class="${state.settings.theme === th ? "on" : ""}" data-action="theme" data-value="${th}">${themeIcons[th]} ${t(th)}</button>`,
      )
      .join("")}</div>
    <h4>${t("welcomeQ")}</h4>
    <label class="amount"><span>$</span><input id="welcomeInput" type="text" inputmode="decimal" placeholder="0.00" value="${escapeHTML(typed)}"></label>
    <button class="go spend" data-action="go">${t("letsGo")}</button>`,
    {
      lang: (btn) => {
        setLanguage(btn.dataset.value);
        showWelcome();
      },
      theme: (btn) => {
        setTheme(btn.dataset.value);
        showWelcome();
      },
      go: () => {
        const value = parseAmount($("welcomeInput").value);
        state.start = Number.isNaN(value) ? 0 : value;
        state.setupDone = true;
        lastBalance = null;
        save();
        render();
        closeSheet();
      },
    },
    true,
  );
}

/* ============ 13. START UP ============ */

applyLanguage(state.settings.lang);
document.documentElement.dataset.theme = state.settings.theme;
render();
if (!state.setupDone) showWelcome();

// Ask the browser not to auto-delete our data when the device is low on space.
if (navigator.storage && navigator.storage.persist)
  navigator.storage.persist().catch(() => {});

// Offline support (only works on https, so not when testing from a file).
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
