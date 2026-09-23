// Regenerates the language panel of the profile README from the last year of
// commit contributions. Run by .github/workflows/langs.yml.
//
// Env:
//   PROFILE_TOKEN  personal access token with read:user (and repo, to count
//                  private contributions)
//   LOGIN          GitHub user whose contributions to read

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TOP_N = 5;                 // languages shown before everything else is grouped
const W = 1200, H = 186;
const BAR_Y = 62, BAR_H = 34;
const FONT = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';

const THEMES = {
    dark:  { bg: '#0d1117', ink: '#e6edf3', muted: '#9198a1', cn: '#7ee787', cf: '#4cc2ff' },
    light: { bg: '#ffffff', ink: '#1f2328', muted: '#59636e', cn: '#0969da', cf: '#8250df' }
};

const QUERY = `
query($login: String!, $from: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from) {
      commitContributionsByRepository(maxRepositories: 100) {
        contributions { totalCount }
        repository { primaryLanguage { name } }
      }
    }
  }
}`;

async function fetchLanguages(login, token) {
    const from = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
    const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
            Authorization: `bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'profile-langs'
        },
        body: JSON.stringify({ query: QUERY, variables: { login, from } })
    });
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);

    const json = await res.json();
    if (json.errors) throw new Error(json.errors.map((e) => e.message).join('; '));

    const rows = json.data?.user?.contributionsCollection?.commitContributionsByRepository;
    if (!rows) throw new Error('no contribution data in response');

    const byLang = new Map();
    for (const row of rows) {
        const name = row.repository.primaryLanguage?.name;
        if (!name) continue;                       // repos with no language detected
        byLang.set(name, (byLang.get(name) || 0) + row.contributions.totalCount);
    }
    if (byLang.size === 0) throw new Error('no commits with a detected language');

    const sorted = [...byLang.entries()].sort((a, b) => b[1] - a[1]);
    const head = sorted.slice(0, TOP_N);
    const restTotal = sorted.slice(TOP_N).reduce((sum, [, n]) => sum + n, 0);
    if (restTotal > 0) head.push(['Otros', restTotal]);

    const total = head.reduce((sum, [, n]) => sum + n, 0);
    return head.map(([name, n]) => [name, (n * 100) / total]);
}

const mix = (a, b, f) => {
    const p = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * f).toString(16).padStart(2, '0')).join('');
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Entrada escalonada que degrada bien: el valor base del elemento queda
// visible y la animación sostiene el cero durante el retardo. Empezar en
// opacity="0" dejaba el panel en blanco allí donde no corre SMIL.
const fade = (delay, dur) => {
    const total = delay + dur;
    return `<animate attributeName="opacity" values="0;0;1" keyTimes="0;${(delay / total).toFixed(4)};1" `
        + `dur="${total.toFixed(2)}s" begin="0s" fill="freeze"/>`;
};

export function renderPanel(langs, theme) {
    const t = THEMES[theme];
    const n = langs.length;
    const cols = langs.map((_, i) => mix(t.cf, t.cn, n === 1 ? 0 : i / (n - 1)));
    const R = BAR_H / 2;

    // Los tramos son rectángulos planos y las puntas redondeadas salen de un
    // recorte sobre toda la barra. Calcular la curva por segmento se rompía
    // cuando uno medía menos que el radio: el trazo se iba hacia atrás.
    let x = 0;
    const segs = langs.map(([, pct], i) => {
        const w = (W * pct) / 100;
        const seg = `<rect x="${x.toFixed(1)}" y="${BAR_Y}" width="${w.toFixed(1)}" height="${BAR_H}" fill="${cols[i]}">`
            + fade(0.15 + i * 0.12, 0.45) + '</rect>';
        x += w;
        return seg;
    }).join('');

    const labels = langs.map(([name, pct], i) => {
        const lx = i * (W / n);
        return `<g>${fade(0.3 + i * 0.12, 0.45)}`
            + `<rect x="${lx.toFixed(0)}" y="${BAR_Y + 62}" width="11" height="11" rx="2.5" fill="${cols[i]}"/>`
            + `<text x="${(lx + 20).toFixed(0)}" y="${BAR_Y + 72}" font-family="${FONT}" font-size="17" font-weight="500" fill="${t.ink}">${esc(name)}</text>`
            + `<text x="${(lx + 20).toFixed(0)}" y="${BAR_Y + 96}" font-family="${FONT}" font-size="15" fill="${t.muted}">${pct.toFixed(1)} %</text></g>`;
    }).join('');

    const alt = 'Lenguajes por número de commits en los últimos doce meses: '
        + langs.map(([name, pct]) => `${name} ${pct.toFixed(1)} por ciento`).join(', ') + '.';

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(alt)}">`
        + `<rect width="${W}" height="${H}" fill="${t.bg}"/>`
        + `<text x="0" y="26" font-family="${FONT}" font-size="13" font-weight="600" fill="${t.muted}" letter-spacing="2.2">`
        + `LENGUAJES POR NÚMERO DE COMMITS · ÚLTIMOS 12 MESES</text>`
        + `<defs><clipPath id="bar"><rect x="0" y="${BAR_Y}" width="${W}" height="${BAR_H}" rx="${R}"/></clipPath></defs>`
        + `<g clip-path="url(#bar)">${segs}</g>`
        + labels + '</svg>\n';
}

async function main() {
    const token = process.env.PROFILE_TOKEN;
    const login = process.env.LOGIN;
    if (!token) throw new Error('PROFILE_TOKEN is not set');
    if (!login) throw new Error('LOGIN is not set');

    const langs = await fetchLanguages(login, token);
    for (const theme of ['light', 'dark']) {
        writeFileSync(`assets/langs-${theme}.svg`, renderPanel(langs, theme));
    }
    console.log(langs.map(([n, p]) => `${n} ${p.toFixed(1)}%`).join('  ·  '));
}

// pathToFileURL, not string concatenation: the naive form never matches on Windows
const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entry && import.meta.url === entry) {
    main().catch((err) => { console.error(err.message); process.exit(1); });
}
