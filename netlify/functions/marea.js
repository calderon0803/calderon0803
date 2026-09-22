// Renders the last 48h of tide and swell off the Cantabrian coast as an SVG,
// so the profile README can embed it as a live image.
//
// Query params:
//   theme=dark|light   colour scheme (default: light)

const LAT = 43.47;                  // Santander coast
const LON = -3.79;
const API = 'https://marine-api.open-meteo.com/v1/marine';

const THEMES = {
    dark:  { bg: '#0d1117', ink: '#e6edf3', muted: '#9198a1', faint: '#21262d', acc: '#4cc2ff' },
    light: { bg: '#ffffff', ink: '#1f2328', muted: '#59636e', faint: '#e8ebef', acc: '#0969da' }
};

const W = 1200;
const H = 300;
const TOP = 96;                     // plot area, leaves room for the heading
const BOT = 250;

const FONT = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function fetchMarine() {
    const url = `${API}?latitude=${LAT}&longitude=${LON}`
        + '&hourly=sea_level_height_msl,wave_height,wave_period'
        + '&timezone=Europe%2FMadrid&past_days=1&forecast_days=1';
    const res = await fetch(url, { headers: { 'User-Agent': 'calderon0803-profile' } });
    if (!res.ok) throw new Error(`marine api ${res.status}`);
    return res.json();
}

function chrome(t, title, subtitle) {
    return `<rect width="${W}" height="${H}" fill="${t.bg}"/>`
        + `<text x="0" y="30" font-family="${FONT}" font-size="13" font-weight="600" fill="${t.muted}" letter-spacing="2.2">${esc(title)}</text>`
        + `<text x="0" y="62" font-family="${FONT}" font-size="22" font-weight="600" fill="${t.ink}" letter-spacing="-0.3">${esc(subtitle)}</text>`;
}

function render(data, t) {
    const h = data.hourly;
    const times = h.time;
    const tide = h.sea_level_height_msl;

    // Keep only the samples where the tide series actually has values.
    const idx = times.map((_, i) => i).filter((i) => tide[i] !== null && tide[i] !== undefined);
    if (idx.length < 4) throw new Error('not enough tide samples');

    const vals = idx.map((i) => tide[i]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const span = hi - lo || 1;

    const x = (k) => (W * k) / (idx.length - 1);
    const y = (v) => BOT - ((v - lo) / span) * (BOT - TOP);

    const pts = idx.map((i, k) => `${x(k).toFixed(1)},${y(tide[i]).toFixed(1)}`).join(' ');

    // "Now" is the boundary between the past day and the forecast: find the
    // sample closest to the current time rather than assuming a fixed offset.
    const now = Date.now();
    let nowK = 0;
    let best = Infinity;
    idx.forEach((i, k) => {
        const d = Math.abs(new Date(times[i]).getTime() - now);
        if (d < best) { best = d; nowK = k; }
    });

    const grid = [lo, (lo + hi) / 2, hi].map((v) =>
        `<line x1="0" y1="${y(v).toFixed(1)}" x2="${W}" y2="${y(v).toFixed(1)}" stroke="${t.faint}" stroke-width="1"/>`
        + `<text x="${W}" y="${(y(v) - 7).toFixed(1)}" font-family="${FONT}" font-size="11" fill="${t.muted}" text-anchor="end" opacity="0.75">${v.toFixed(1)} m</text>`
    ).join('');

    const waveH = h.wave_height[idx[nowK]];
    const waveT = h.wave_period[idx[nowK]];
    const facts = [
        `carrera de marea ${(hi - lo).toFixed(2)} m`,
        waveH != null ? `oleaje ${waveH.toFixed(1)} m` : null,
        waveT != null ? `periodo ${waveT.toFixed(0)} s` : null
    ].filter(Boolean).join('  ·  ');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Marea y oleaje en la costa de Cantabria durante 48 horas. Carrera de marea ${(hi - lo).toFixed(2)} metros.">`
        + chrome(t, 'MAREA Y OLEAJE · COSTA DE CANTABRIA', facts)
        + grid
        + `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">`
        + `<stop offset="0%" stop-color="${t.acc}" stop-opacity="0.26"/>`
        + `<stop offset="100%" stop-color="${t.acc}" stop-opacity="0.03"/></linearGradient></defs>`
        + `<polygon points="0,${H} ${pts} ${W},${H}" fill="url(#g)"/>`
        + `<polyline points="${pts}" fill="none" stroke="${t.acc}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`
        + `<line x1="${x(nowK).toFixed(1)}" y1="${TOP - 14}" x2="${x(nowK).toFixed(1)}" y2="${BOT + 8}" stroke="${t.muted}" stroke-width="1" stroke-dasharray="3 3" opacity="0.8"/>`
        + `<circle cx="${x(nowK).toFixed(1)}" cy="${y(tide[idx[nowK]]).toFixed(1)}" r="4" fill="${t.acc}"/>`
        + `<text x="${(x(nowK) + 10).toFixed(1)}" y="${(TOP - 18).toFixed(1)}" font-family="${FONT}" font-size="12" fill="${t.muted}">ahora</text>`
        + `<text x="0" y="${H - 12}" font-family="${FONT}" font-size="11.5" fill="${t.muted}" opacity="0.6">${esc(times[idx[0]].replace('T', ' '))} a ${esc(times[idx[idx.length - 1]].replace('T', ' '))} · datos de Open-Meteo Marine · 43.47 N, 3.79 O</text>`
        + `</svg>`;
}

function fallback(t, message) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 120" width="${W}" height="120" role="img" aria-label="${esc(message)}">`
        + `<rect width="${W}" height="120" fill="${t.bg}"/>`
        + `<text x="0" y="34" font-family="${FONT}" font-size="13" font-weight="600" fill="${t.muted}" letter-spacing="2.2">MAREA Y OLEAJE · COSTA DE CANTABRIA</text>`
        + `<text x="0" y="68" font-family="${FONT}" font-size="17" fill="${t.ink}">${esc(message)}</text></svg>`;
}

exports.handler = async (event) => {
    const t = THEMES[(event.queryStringParameters || {}).theme === 'dark' ? 'dark' : 'light'];
    // Half an hour: the tide barely moves faster than that, and GitHub's image
    // proxy caches anyway, so asking for less would only burn API calls.
    const headers = {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=1800, s-maxage=1800'
    };

    try {
        return { statusCode: 200, headers, body: render(await fetchMarine(), t) };
    } catch (err) {
        // Still answer 200: a broken image in the README is worse than a card
        // that admits the data is missing.
        return {
            statusCode: 200,
            headers: { ...headers, 'Cache-Control': 'public, max-age=120' },
            body: fallback(t, 'Datos de marea no disponibles ahora mismo.')
        };
    }
};
