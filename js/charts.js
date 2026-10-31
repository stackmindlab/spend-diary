/*
  charts.js — the three charts, drawn by hand.

  No chart library: each function just builds a string of SVG/HTML.
  SVG ("scalable vector graphics") is a way to draw shapes with tags,
  like <circle> and <polyline>, that stay sharp at any size.
*/

/*
  DONUT CHART
  Trick: a circle with radius 15.915 has a circumference of exactly 100.
  So a slice that is 30% of the spending is a dash 30 units long.
  "stroke-dasharray" = how long the dash is, then how long the gap is.
  "stroke-dashoffset" = where along the circle that dash starts.
*/
function donutChart(slices, centerBig, centerSmall) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  let used = 0;

  const rings = slices.map(s => {
    const pct = (s.value / total) * 100;
    // 25 moves the start to 12 o'clock (circles normally start at 3 o'clock).
    const ring = `<circle class="donut-slice" cx="21" cy="21" r="15.915" fill="none"
      stroke="${s.color}" stroke-width="6"
      stroke-dasharray="${pct.toFixed(2)} ${(100 - pct).toFixed(2)}"
      stroke-dashoffset="${(25 - used).toFixed(2)}"></circle>`;
    used += pct;
    return ring;
  }).join("");

  return `
    <div class="donut">
      <svg viewBox="0 0 42 42" role="img" aria-label="${escapeHTML(centerSmall)}">
        <circle cx="21" cy="21" r="15.915" fill="none" class="donut-track" stroke-width="6"></circle>
        ${rings}
      </svg>
      <div class="donut-center"><b>${escapeHTML(centerBig)}</b><span>${escapeHTML(centerSmall)}</span></div>
    </div>`;
}

/*
  BAR LIST
  Each row is a label, an amount, and a bar whose width is a % of the biggest row.
  The width starts at 0 and the CSS transition animates it out (see animateBars in app.js).
*/
function barList(rows, total) {
  const biggest = Math.max(...rows.map(r => r.value));
  return rows.map(r => `
           <div class="bar-row" ${r.id ? `data-id="${escapeHTML(r.id)}" role="button" tabindex="0"` : ""}>
      <div class="bar-top">
        <span>${r.emoji} ${escapeHTML(r.label)}</span>
        <span><b>${formatMoney(r.value)}</b><small>${Math.round((r.value / total) * 100)}%</small></span>
      </div>
      <div class="bar"><i data-width="${((r.value / biggest) * 100).toFixed(1)}" style="background:${r.color}"></i></div>
    </div>`).join("");
}

/*
  LINE CHART — your balance at the end of each day.
  points = [{ label: "Oct 1", value: 500 }, ...]
  We turn each value into an (x, y) spot inside a 320×140 box.
  In SVG, y = 0 is the TOP, so bigger money = smaller y.
*/
function lineChart(points) {
  const W = 320, H = 140, PAD = 8;
  const values = points.map(p => p.value);
  const min = Math.min(...values, 0);   // include 0 so the chart shows how close you are to empty
  let max = Math.max(...values);
  if (max === min) max = min + 1;     // avoid dividing by zero when everything is the same

  const x = i => points.length === 1 ? W / 2 : PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = v => PAD + (1 - (v - min) / (max - min)) * (H - PAD * 2);

  const coords = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
  const line = coords.join(" ");
  // The shaded area: the line, then down to the bottom corners.
  const area = `M${coords[0]} L${coords.join(" L")} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  const last = points[points.length - 1];
  const zeroY = y(0);

  return `
    <svg class="line-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${escapeHTML(t("myMonth"))}">
      <path d="${area}" class="line-area"></path>
      ${min < 0 ? `<line x1="0" x2="${W}" y1="${zeroY}" y2="${zeroY}" class="line-zero"></line>` : ""}
      <polyline points="${line}" class="line-stroke" fill="none" vector-effect="non-scaling-stroke"></polyline>
    </svg>
    <div class="line-labels">
      <span>${escapeHTML(points[0].label)}</span>
      <span><b>${formatMoney(last.value)}</b> · ${escapeHTML(last.label)}</span>
    </div>`;
}