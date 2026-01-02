let projects = [];
const chartRegistry = new Map();

document.getElementById("year").textContent = new Date().getFullYear();

async function loadProjects() {
  try {
    // This fetches from your deployed site. When you edit JSON on GitHub,
    // Netlify rebuilds and the deployed JSON updates.
    const res = await fetch("data/projects.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load data/projects.json (${res.status})`);
    const data = await res.json();
    projects = Array.isArray(data.projects) ? data.projects : [];
    renderProjects();
  } catch (err) {
    console.error(err);
    const root = document.getElementById("projectsRoot");
    root.innerHTML = `<div class="intro-card">
      <h2>Data load failed</h2>
      <p class="muted">Check that <code>data/projects.json</code> exists and is valid JSON.</p>
    </div>`;
  }
}

function formatNumber(v) {
  if (typeof v !== "number") return String(v);
  if (Math.abs(v) >= 1000 && Number.isInteger(v)) return v.toLocaleString();
  return String(v);
}

function isPercentKpi(name) {
  return /%|ctr/i.test(name);
}

function computeDelta(before, after) {
  if (typeof before !== "number" || typeof after !== "number") return { text: "—", cls: "flat" };
  const diff = after - before;
  const pct = before !== 0 ? (diff / before) * 100 : null;
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "■";
  const cls = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  return { diff, pct, arrow, cls };
}

function renderKpiRow(k) {
  const { before, after, name } = k;
  const d = computeDelta(before, after);

  let deltaText = "—";
  if (typeof before === "number" && typeof after === "number") {
  const pct = d.pct ?? 0;
  const sign = pct > 0 ? "+" : "";
  deltaText = `${d.arrow} ${sign}${pct.toFixed(1)}%`;
}


  return `
    <tr>
      <td>${escapeHtml(name)}</td>
      <td>${escapeHtml(formatNumber(before))}</td>
      <td>${escapeHtml(formatNumber(after))}</td>
      <td><span class="delta ${d.cls}">${escapeHtml(deltaText)}</span></td>
    </tr>
  `;
}

function getDefaultChartKpi(p) {
  const keys = p?.timeSeries?.series ? Object.keys(p.timeSeries.series) : [];
  const ctr = keys.find((k) => /ctr/i.test(k));
  return ctr || keys[0] || p.kpis?.[0]?.name || "";
}

function renderProjects() {
  const root = document.getElementById("projectsRoot");
  root.innerHTML = "";

  projects.forEach((p) => {
    const defKpi = getDefaultChartKpi(p);

    const options = (p?.timeSeries?.series ? Object.keys(p.timeSeries.series) : [])
      .map((name) => {
        const selected = name === defKpi ? "selected" : "";
        return `<option value="${escapeAttr(name)}" ${selected}>Chart: ${escapeHtml(name)}</option>`;
      })
      .join("");

    const card = document.createElement("article");
    card.className = "project-card";
    card.innerHTML = `
      <div class="project-top">
        <div>
          <h3 class="project-title">${escapeHtml(p.title)}</h3>
          
        </div>
        <span class="tag">${escapeHtml(p.gameTag || "")}</span>
      </div>

      <div class="project-body">
        <div class="thumb-wrap">
          <img src="${escapeAttr(p.thumbnailUrl)}" alt="${escapeHtml(p.title)} thumbnail" />
        </div>

        <div class="panel">
          <div>
            <table class="kpi-table" aria-label="KPI before and after table">
              <thead>
                <tr>
                  <th>KPI</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                ${(p.kpis || []).map(renderKpiRow).join("")}
              </tbody>
            </table>
          </div>

          <div class="controls" data-project="${escapeAttr(p.id)}">
            <select data-action="chartSelect" aria-label="Choose KPI for chart">
              ${options}
            </select>
          </div>

          <div class="chart-wrap">
            <canvas id="chart_${escapeAttr(p.id)}" height="140"></canvas>
          </div>
        </div>
      </div>
    `;

    root.appendChild(card);
    wireChartSelect(p.id);
    renderChart(p.id, defKpi);
  });
}

function wireChartSelect(projectId) {
  const controls = document.querySelector(`.controls[data-project="${cssEscape(projectId)}"]`);
  if (!controls) return;
  const sel = controls.querySelector('[data-action="chartSelect"]');
  if (!sel) return;
  sel.addEventListener("change", (e) => renderChart(projectId, e.target.value));
}

function renderChart(projectId, kpiName) {
  const proj = projects.find((x) => x.id === projectId);
  if (!proj || !proj.timeSeries || !proj.timeSeries.series) return;

  const canvasId = `chart_${projectId}`;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const existing = chartRegistry.get(canvasId);
  if (existing) existing.destroy();

  const labels = proj.timeSeries.labels || [];
  const series = proj.timeSeries.series[kpiName] || [];

  const chart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: kpiName,
          data: series,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "rgba(255,255,255,0.75)" } }
      },
      scales: {
        x: { ticks: { color: "rgba(255,255,255,0.6)" }, grid: { color: "rgba(255,255,255,0.06)" } },
        y: { ticks: { color: "rgba(255,255,255,0.6)" }, grid: { color: "rgba(255,255,255,0.06)" } }
      }
    }
  });

  chartRegistry.set(canvasId, chart);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(str) {
  return escapeHtml(str).replaceAll("`", "&#096;");
}
function cssEscape(str) {
  // minimal CSS escape for attribute selectors
  return String(str).replaceAll('"', '\\"');
}

// GO
loadProjects();
