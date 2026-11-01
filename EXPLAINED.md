# How Spend Diary works (study guide)

This guide explains the code so you can walk someone through it: a recruiter, an interviewer, or future you.

---

## 1. The big idea: one state object, one render function

All the app's data lives in **one JavaScript object** called `state` (see the top of `js/storage.js`):

```js
{
  start: 500,
  monthStart: "2026-10-01",
  entries: [ { id, type: "spend", amt: 12.8, catId: "eatout", note: "Sonic", date } ],
  categories: { spend: [...], add: [...] },
  months: [...],
  settings: { theme: "blush", lang: "en" },
  setupDone: true
}
```

Every action follows the same three steps:

1. **Change `state`** (for example, push a new entry)
2. **`save()`**: write `state` to localStorage
3. **`render()`**: redraw the screen from `state`

The screen never stores data itself. That's why undo, restoring a backup and switching languages are all easy: change `state`, then call `render()`.

> **Interview line:** "The UI is a function of the state. It's the same idea React is built on, just done by hand."

---

## 2. Why plain JavaScript (no React)?

- The app is small: one screen with a few pop-ups.
- No build step means anyone can open `index.html` and it works.
- Doing it by hand shows I understand what frameworks do for you (rendering, state, events).

The trade-off: `innerHTML` re-draws whole sections. That's fine at this size, but a bigger app would benefit from React's smarter updates.

---

## 3. Why the scripts load in a certain order

```html
<script src="js/helpers.js"></script>
<!-- $(), escapeHTML, formatMoney -->
<script src="js/i18n.js"></script>
<!-- t(), languages -->
<script src="js/storage.js"></script>
<!-- uses detectLanguage() from i18n -->
<script src="js/charts.js"></script>
<!-- uses escapeHTML, formatMoney, t -->
<script src="js/app.js"></script>
<!-- uses everything -->
```

Classic `<script>` tags share one global scope, so a file can use anything defined by the files _above_ it. (A future upgrade would be ES modules with `import`/`export`. That requires a local server, which is why I kept it simple.)

---

## 4. Saving: localStorage

```js
localStorage.setItem("spend-diary-v1", JSON.stringify(state)); // save
JSON.parse(localStorage.getItem("spend-diary-v1")); // load
```

- **localStorage** is a small key/value store built into every browser. It's per-website and per-device.
- It only holds text, so we convert the object to JSON text and back.
- It's wrapped in `try/catch` because some private-browsing modes block it, and the app shouldn't crash.

**Why no database?** Privacy. No server means there's nothing to hack and no one else's money data to be responsible for. The trade-off is no sync between devices, which is why there's a backup/restore feature.

---

## 5. Security (good stuff to talk about)

### XSS protection: `escapeHTML()` in `helpers.js`

We build HTML strings and put them on the page with `innerHTML`. If someone typed a note like:

```
<img src=x onerror=alert(1)>
```

the browser would run that code. `escapeHTML()` turns `<` into `&lt;` (and so on), so typed text is always **shown**, never **run**. Every piece of user text goes through it: notes and category names.

### Validating input: `cleanState()` in `storage.js`

A backup file could be broken or edited by someone. Before we trust it, `cleanState()` checks every field: numbers are real numbers, text isn't too long, dates are real dates. Anything that fails gets thrown out.

### Content-Security-Policy: `vercel.json`

This is a header the server sends with the page that tells the browser what's allowed:

- `script-src 'self'` → only our own JS files can run (no injected scripts)
- `connect-src 'self'` → the page can't send data to any other website
- `frame-ancestors 'none'` → other sites can't embed us (protects against clickjacking)

It's a second layer: even if an XSS bug slipped through, the browser would block outside scripts.

---

## 6. The charts (`charts.js`)

All three are hand-drawn SVG, built as strings.

### Donut: the circumference trick

A circle with radius **15.915** has a circumference of **100** (2 × π × 15.915 ≈ 100). So a category that's 30% of spending is a dash **30 units long**:

```js
stroke-dasharray="30 70"      // 30 drawn, 70 gap
stroke-dashoffset="25 - used" // where it starts; 25 moves the start to 12 o'clock
```

Each slice starts where the last one ended.

### Line chart: turning money into coordinates

```js
const x = (i) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
const y = (v) => PAD + (1 - (v - min) / (max - min)) * (H - PAD * 2);
```

- `x` spreads the days evenly across the width.
- `y` is flipped (`1 - ...`) because in SVG, y = 0 is the **top**.
- We include 0 in the range so you can see how close you are to running out.

### Bars

Each bar's width is a % of the **biggest** category, so the top one is always full width. Bars start at width 0, then `animateBars()` sets the real width one frame later, and the CSS `transition` animates the growth.

---

## 7. Categories

Each entry stores a category **id**, not its name:

```js
{ amt: 6.45, catId: "lq8x2k9ab" }
```

That's why renaming a category instantly updates every old entry: the name is looked up when it's displayed.

Starter categories have a `key` (like `"food"`) so their names can be translated. Custom ones have `key: null` and keep whatever the person typed.

**Deleting a category that has entries:** we never delete the money. The app asks where to move those entries, so totals stay correct.

---

### Places ("Where?")

Each entry can have a `place`, like `"Sonic"`. `state.places` remembers the places you've used **per category**:

```js
places: { eatout: ["Sonic", "McDonald's"], food: ["Whole Foods"] }
```

- `rememberPlace()` puts the newest place first, removes duplicates and keeps 12 max.
- `matchSavedPlace()` means typing `sonic` reuses your saved spelling `Sonic`.
- `totalsByPlace()` adds up money per place, lowercased so "Sonic" and "sonic" count as one.
- Tapping a category reuses `barList()` from charts.js for the breakdown pop-up (don't repeat yourself).

---

## 8. English / Spanish (`i18n.js`)

- Every piece of text has a key, like `t("spent")`.
- `{placeholders}` get filled in: `t("overBy", { amt: "$5.00" })`.
- Static text in the HTML uses `data-i18n="key"`, and `applyLanguage()` fills it all in.
- Dates use the browser's built-in `toLocaleDateString("es-US")`, so we don't need to translate month names by hand.

---

## 9. Themes (`themes.css`)

Each theme is just a list of CSS variables:

```css
[data-theme="midnight"] { --ink: #e7ecf7; --card: rgba(26,33,56,.78); ... }
```

`styles.css` only ever uses `var(--ink)` and friends. Switching theme = changing **one attribute** on `<html>`:

```js
document.documentElement.dataset.theme = "midnight";
```

---

## 10. Responsive design

The CSS is **mobile first**: the base styles are for phones. One media query adds two columns on big screens:

```css
@media (min-width: 900px) {
  .layout {
    display: grid;
    grid-template-columns: 420px 1fr;
  }
  .layout > .col:first-child {
    position: sticky;
    top: 20px;
  }
}
```

On a laptop, the entry form stays in view (sticky) while you scroll the charts.

---

## 11. Animations

Most animations are pure CSS `@keyframes`, so the JavaScript stays simple.

| Animation               | How                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| Line chart draws itself | `clip-path: inset(0 100% 0 0)` → `inset(0)`, which uncovers it left to right                        |
| Donut sweeps in         | each slice animates `stroke-dasharray` from `0 100` to its real size, using a CSS variable `--dash` |
| Bars grow one by one    | JS gives each bar a slightly bigger `transitionDelay`                                               |
| Sparkle burst           | JS creates small `<span>`s, CSS flies them outward using `--x` / `--y`, then they're removed        |
| Delete slides out       | add a `slide-out` class, wait for the animation, **then** remove the data                           |
| Theme cross-fade        | `document.startViewTransition()`, where the browser fades old → new                                 |
| Springy buttons         | `cubic-bezier(.34, 1.56, .64, 1)`, a curve that overshoots a little and settles                     |

Everything respects **`prefers-reduced-motion`**: if someone turns motion off on their phone, the animations are skipped.

---

## 12. Small details worth mentioning

| Detail                                       | Why                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `round2()` on all money                      | `0.1 + 0.2` is `0.30000000000000004` in JavaScript, so we round to cents                 |
| `localDate("2026-10-31")`                    | `new Date("2026-10-31")` is read as UTC and can show the wrong day in US time zones      |
| `todayISO()` uses local date parts           | `toISOString()` is UTC, which is already "tomorrow" in the evening in US time zones      |
| Balance chart starts at your starting amount | So there's a line to see even on day one (my first bug-fix PR)                           |
| Colors must match `#rrggbb`                  | Stops a tampered backup file from sneaking HTML in through a color value                 |
| `[...state.entries].reverse()`               | `.reverse()` changes the array in place, so we copy it first                             |
| Event delegation                             | One click listener on a parent (like `#chips`) handles every chip, even ones drawn later |
| `prefers-reduced-motion`                     | Turns animations off for people who set that on their phone                              |
| `navigator.storage.persist()`                | Asks the browser not to auto-clear our data when space is low                            |

---

## 13. Practice questions

1. **Where is the data stored, and who can see it?** In localStorage on the device. Only someone using that browser on that device.
2. **What happens if you clear your browser data?** It's gone, which is why there's Back up / Restore.
3. **How do you prevent XSS?** Escape all user text before putting it in `innerHTML`, plus a Content-Security-Policy.
4. **How would you add sync?** Accounts plus a database (Supabase/MongoDB), with end-to-end encryption so the server only stores scrambled data.
5. **Why store category ids on entries instead of names?** So renaming works and two categories can't get mixed up.
6. **How does the donut chart work?** Radius 15.915 makes the circumference 100, so each slice's percentage equals its dash length.
7. **Why animate the delete _before_ removing the data?** If the data went first, `render()` would redraw the list and the row would vanish before it could slide out.
8. **What does `prefers-reduced-motion` do?** It lets people with motion sensitivity turn animations off, and the app respects it.
