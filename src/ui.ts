import type { MatchEngineResponse } from "./core/engine";
import type { GarmentAttributes } from "./types";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEdgePlaygroundHtml(
  wardrobe: readonly GarmentAttributes[],
  match: MatchEngineResponse,
  storeDomain: string,
): string {
  const bootstrapJson = JSON.stringify({
    wardrobe,
    storeDomain,
    initialSeason: "fall",
    initialFormality: 3,
    initialQuery: "layering smart-casual",
  }).replace(/</g, "\\u003c");

  const dslPretty = escapeHtml(JSON.stringify(match.elasticsearchQuery, null, 2));

  const wardrobeCards = wardrobe
    .map(
      (item) => `
      <div class="closet-item">
        <span class="swatch" style="background:${escapeHtml(item.colorHex)}"></span>
        <div class="closet-meta">
          <div class="closet-name">${escapeHtml(item.name)}</div>
          <div class="closet-sub">${escapeHtml(item.slot)} · F${item.formality} · ${escapeHtml(item.fabric)}</div>
        </div>
      </div>`,
    )
    .join("");

  const gapBadges = match.gapReport.gaps
    .map(
      (g) =>
        `<div class="gap-pill"><span class="gap-dot"></span><span>${escapeHtml(g.reason)}</span></div>`,
    )
    .join("");

  const matchCards = match.results
    .slice(0, 3)
    .map((r, idx) => {
      const topOutfit = r.sampleOutfits[0];
      const outfitHtml = topOutfit
        ? `<div class="outfit-box">
            <div class="outfit-label">Top unlocked outfit · OKLab harmony ${(topOutfit.harmonyScore * 100).toFixed(0)}%</div>
            <div class="outfit-chips">${topOutfit.items.map((n) => `<span class="chip">${escapeHtml(n)}</span>`).join("")}</div>
          </div>`
        : "";

      const gapHtml =
        r.fillsGaps.length > 0
          ? `<div class="fills-gap">Fills gap: ${escapeHtml(r.fillsGaps[0])}</div>`
          : "";

      return `
      <article class="match-card ${idx === 0 ? "top-match" : ""}">
        <div class="match-head">
          <div class="match-title-row">
            <span class="swatch lg" style="background:${escapeHtml(r.product.colorHex)}"></span>
            <div>
              <h3>${escapeHtml(r.product.name)}</h3>
              <div class="match-sub">${escapeHtml(r.product.fabric)} · $${r.product.priceUsd} · Formality ${r.product.formality}/5</div>
            </div>
          </div>
          <div class="delta-badge">
            <span class="delta-num">+${r.marginalOutfitsUnlocked}</span>
            <span class="delta-lbl">outfits unlocked</span>
          </div>
        </div>
        ${gapHtml}
        ${outfitHtml}
        <div class="match-foot">
          <span class="metric">RRF ${r.rrfScore.toFixed(4)} · Harmony ${(r.averageHarmony * 100).toFixed(0)}%</span>
          <a class="cart-btn" href="${escapeHtml(r.shopifyCartUrl)}" target="_blank" rel="noopener">Add via Shopify Cart →</a>
        </div>
      </article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>wardrobe-match-edge — Cloudflare Worker · Shopify · Elasticsearch</title>
<style>
  :root {
    --bg: #090a0e;
    --panel: #11131a;
    --panel-2: #161923;
    --border: #232838;
    --text: #f3f5f9;
    --muted: #939bb0;
    --emerald: #34d399;
    --sky: #38bdf8;
    --amber: #fbbf24;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: radial-gradient(circle at top right, #131c2e 0%, var(--bg) 52%);
    color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.45;
  }
  .wrap { max-width: 1280px; margin: 0 auto; padding: 26px 28px 40px; }
  .topbar {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 16px;
    gap: 16px; flex-wrap: wrap;
  }
  .brand { display: flex; flex-direction: column; gap: 4px; }
  .eyebrow {
    display: inline-flex; align-items: center; gap: 8px; font-size: 11px;
    letter-spacing: 0.08em; text-transform: uppercase; color: var(--sky); font-weight: 600;
  }
  .eyebrow .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--emerald); box-shadow: 0 0 10px var(--emerald); }
  h1 { margin: 0; font-size: 24px; font-weight: 650; letter-spacing: -0.02em; }
  .subtitle { margin: 0; font-size: 13px; color: var(--muted); }
  .stats { display: flex; gap: 12px; }
  .stat {
    background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
    padding: 10px 14px; min-width: 124px;
  }
  .stat-val { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
  .stat-val.emerald { color: var(--emerald); }
  .stat-val.sky { color: var(--sky); }
  .stat-lbl { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .controls {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
    padding: 10px 14px; margin-bottom: 18px;
  }
  .controls input[type="text"] {
    flex: 1; min-width: 220px; background: var(--panel-2); border: 1px solid var(--border);
    color: var(--text); border-radius: 8px; padding: 7px 11px; font-size: 13px; outline: none;
  }
  .controls input[type="text"]:focus { border-color: var(--sky); }
  .controls select {
    background: var(--panel-2); border: 1px solid var(--border); color: var(--text);
    border-radius: 8px; padding: 7px 10px; font-size: 12.5px; cursor: pointer;
  }
  .run-btn {
    background: var(--sky); color: #082f49; border: 0; border-radius: 8px;
    padding: 7px 14px; font-size: 12.5px; font-weight: 650; cursor: pointer;
  }
  .run-btn:hover { filter: brightness(1.08); }
  .status-pill { font-size: 11.5px; color: var(--muted); margin-left: auto; }
  .grid { display: grid; grid-template-columns: 320px 1fr 370px; gap: 18px; align-items: start; }
  @media (max-width: 1080px) { .grid { grid-template-columns: 1fr; } }
  .panel {
    background: var(--panel); border: 1px solid var(--border); border-radius: 14px;
    padding: 16px; display: flex; flex-direction: column; gap: 12px;
  }
  .panel-title {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 12px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted);
  }
  .tag {
    font-size: 11px; font-weight: 500; text-transform: none; letter-spacing: 0;
    background: var(--panel-2); border: 1px solid var(--border); color: var(--text);
    padding: 2px 8px; border-radius: 999px;
  }
  .closet-list { display: flex; flex-direction: column; gap: 8px; }
  .closet-item {
    display: flex; align-items: center; gap: 10px; background: var(--panel-2);
    border: 1px solid var(--border); border-radius: 10px; padding: 9px 10px;
  }
  .swatch {
    width: 24px; height: 24px; border-radius: 7px; flex-shrink: 0;
    border: 1px solid rgba(255,255,255,0.18); box-shadow: inset 0 0 0 1px rgba(0,0,0,0.2);
  }
  .swatch.lg { width: 32px; height: 32px; border-radius: 9px; }
  .closet-name { font-size: 13px; font-weight: 600; }
  .closet-sub { font-size: 11px; color: var(--muted); }
  .gap-pill {
    display: flex; align-items: center; gap: 8px; font-size: 12px;
    background: rgba(251, 191, 36, 0.09); border: 1px solid rgba(251, 191, 36, 0.3);
    color: #fde68a; border-radius: 9px; padding: 8px 10px;
  }
  .gap-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--amber); flex-shrink: 0; }
  .matches { display: flex; flex-direction: column; gap: 12px; }
  .match-card {
    background: var(--panel); border: 1px solid var(--border); border-radius: 14px;
    padding: 15px 16px; display: flex; flex-direction: column; gap: 11px;
  }
  .match-card.top-match {
    border-color: rgba(52, 211, 153, 0.45);
    box-shadow: 0 0 0 1px rgba(52, 211, 153, 0.14), 0 14px 36px rgba(0,0,0,0.35);
  }
  .match-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .match-title-row { display: flex; align-items: center; gap: 11px; }
  .match-card h3 { margin: 0; font-size: 15px; font-weight: 650; }
  .match-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .delta-badge {
    text-align: right; background: rgba(52, 211, 153, 0.12);
    border: 1px solid rgba(52, 211, 153, 0.35); border-radius: 10px; padding: 6px 10px; flex-shrink: 0;
  }
  .delta-num { display: block; font-size: 18px; font-weight: 750; color: var(--emerald); line-height: 1.05; }
  .delta-lbl { font-size: 10px; color: #a7f3d0; text-transform: uppercase; letter-spacing: 0.04em; }
  .fills-gap { font-size: 12px; color: #fde68a; }
  .outfit-box {
    background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px;
  }
  .outfit-label { font-size: 11px; color: var(--muted); margin-bottom: 6px; }
  .outfit-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    font-size: 11px; background: #1e2331; border: 1px solid #2c3347; color: #e2e8f0;
    padding: 3px 8px; border-radius: 6px;
  }
  .match-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .metric { font-size: 11.5px; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .cart-btn {
    font-size: 12px; font-weight: 600; text-decoration: none; color: #052e16;
    background: var(--emerald); padding: 6px 11px; border-radius: 8px;
  }
  pre {
    margin: 0; padding: 12px; border-radius: 10px; background: #0a0c12;
    border: 1px solid var(--border); font-size: 10.5px; line-height: 1.48; color: #cbd5e1;
    overflow: auto; max-height: 550px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
</style>
</head>
<body>
  <div class="wrap">
    <header class="topbar">
      <div class="brand">
        <span class="eyebrow"><span class="dot"></span>wardrobe-match-edge · Cloudflare Worker + Vercel Edge</span>
        <h1>Marginal Outfits Unlocked &amp; Hybrid Search</h1>
        <p class="subtitle">OKLab perceptual color harmony · Wardrobe gap graph · Shopify Storefront Cart Permalinks (${escapeHtml(storeDomain)})</p>
      </div>
      <div class="stats">
        <div class="stat">
          <div class="stat-val" id="stat-items">${match.gapReport.itemCount}</div>
          <div class="stat-lbl">Closet items</div>
        </div>
        <div class="stat">
          <div class="stat-val sky" id="stat-baseline">${match.gapReport.existingValidOutfits}</div>
          <div class="stat-lbl">Baseline outfits</div>
        </div>
        <div class="stat">
          <div class="stat-val emerald" id="stat-delta">+${match.results[0]?.marginalOutfitsUnlocked ?? 0}</div>
          <div class="stat-lbl">Top SKU ΔOutfits</div>
        </div>
      </div>
    </header>

    <form class="controls" id="match-form">
      <input type="text" id="q-input" value="layering smart-casual" placeholder="Search Shopify catalog (e.g. suede jacket, blazer, tailored outerwear)..." />
      <select id="season-select" aria-label="Season">
        <option value="fall" selected>Season: Fall</option>
        <option value="spring">Season: Spring</option>
        <option value="summer">Season: Summer</option>
        <option value="winter">Season: Winter</option>
      </select>
      <select id="formality-select" aria-label="Target formality">
        <option value="2">Formality: F2 Casual</option>
        <option value="3" selected>Formality: F3 Smart-Casual</option>
        <option value="4">Formality: F4 Tailored</option>
      </select>
      <button class="run-btn" type="submit">Run Edge Match</button>
      <span class="status-pill" id="status-pill">POST /v1/match · live edge ranker</span>
    </form>

    <div class="grid">
      <aside class="panel">
        <div class="panel-title"><span>Shopper Wardrobe</span><span class="tag" id="profile-tag">Fall · F3</span></div>
        <div class="closet-list">${wardrobeCards}</div>
        <div class="panel-title" style="margin-top:4px;"><span>Detected Gaps</span></div>
        <div id="gaps-box">${gapBadges}</div>
      </aside>

      <main class="matches">
        <div class="panel-title" style="padding:0 4px;">
          <span>Shopify Catalog Ranked by ΔOutfits + RRF</span>
          <span class="tag" id="query-tag">Query: "layering smart-casual"</span>
        </div>
        <div class="matches" id="matches-box">${matchCards}</div>
      </main>

      <aside class="panel">
        <div class="panel-title"><span>Elasticsearch Hybrid DSL</span><span class="tag">retriever.rrf</span></div>
        <pre id="dsl-pre">${dslPretty}</pre>
      </aside>
    </div>
  </div>
  <script>
    (function () {
      const state = ${bootstrapJson};
      const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
      const form = document.getElementById("match-form");
      const qInput = document.getElementById("q-input");
      const seasonSel = document.getElementById("season-select");
      const formSel = document.getElementById("formality-select");
      const statusEl = document.getElementById("status-pill");

      async function runLiveMatch(e) {
        if (e) e.preventDefault();
        const query = qInput.value.trim();
        const season = seasonSel.value;
        const targetFormality = Number(formSel.value);
        statusEl.textContent = "Computing OKLab + RRF...";
        const t0 = performance.now();
        try {
          const res = await fetch("/v1/match", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              wardrobe: state.wardrobe,
              query,
              season,
              targetFormality,
              storeDomain: state.storeDomain,
              limit: 3,
            }),
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          const data = await res.json();
          const ms = Math.max(1, Math.round(performance.now() - t0));
          statusEl.textContent = "POST /v1/match · " + ms + "ms";
          document.getElementById("stat-items").textContent = String(data.gapReport.itemCount);
          document.getElementById("stat-baseline").textContent = String(data.gapReport.existingValidOutfits);
          document.getElementById("stat-delta").textContent = "+" + (data.results[0]?.marginalOutfitsUnlocked ?? 0);
          document.getElementById("profile-tag").textContent = season[0].toUpperCase() + season.slice(1) + " · F" + targetFormality;
          document.getElementById("query-tag").textContent = query ? 'Query: "' + query + '"' : "All SKUs";
          document.getElementById("dsl-pre").textContent = JSON.stringify(data.elasticsearchQuery, null, 2);

          const gaps = data.gapReport.gaps || [];
          document.getElementById("gaps-box").innerHTML = gaps.length
            ? gaps.map((g) => '<div class="gap-pill"><span class="gap-dot"></span><span>' + esc(g.reason) + "</span></div>").join("")
            : '<div class="tag">No structural gaps detected for this profile</div>';

          document.getElementById("matches-box").innerHTML = (data.results || []).map((r, idx) => {
            const top = r.sampleOutfits && r.sampleOutfits[0];
            const outfitHtml = top
              ? '<div class="outfit-box"><div class="outfit-label">Top unlocked outfit · OKLab harmony ' + Math.round(top.harmonyScore * 100) + '%</div><div class="outfit-chips">' + top.items.map((n) => '<span class="chip">' + esc(n) + "</span>").join("") + "</div></div>"
              : "";
            const gapHtml = r.fillsGaps && r.fillsGaps.length
              ? '<div class="fills-gap">Fills gap: ' + esc(r.fillsGaps[0]) + "</div>"
              : "";
            return '<article class="match-card ' + (idx === 0 ? "top-match" : "") + '"><div class="match-head"><div class="match-title-row"><span class="swatch lg" style="background:' + esc(r.product.colorHex) + '"></span><div><h3>' + esc(r.product.name) + '</h3><div class="match-sub">' + esc(r.product.fabric) + " · $" + r.product.priceUsd + " · Formality " + r.product.formality + '/5</div></div></div><div class="delta-badge"><span class="delta-num">+' + r.marginalOutfitsUnlocked + '</span><span class="delta-lbl">outfits unlocked</span></div></div>' + gapHtml + outfitHtml + '<div class="match-foot"><span class="metric">RRF ' + r.rrfScore.toFixed(4) + " · Harmony " + Math.round(r.averageHarmony * 100) + '%</span><a class="cart-btn" href="' + esc(r.shopifyCartUrl) + '" target="_blank" rel="noopener">Add via Shopify Cart →</a></div></article>';
          }).join("");
        } catch (err) {
          statusEl.textContent = "Error: " + (err && err.message ? err.message : "request failed");
        }
      }

      form.addEventListener("submit", runLiveMatch);
      seasonSel.addEventListener("change", runLiveMatch);
      formSel.addEventListener("change", runLiveMatch);
    })();
  </script>
</body>
</html>`;
}
