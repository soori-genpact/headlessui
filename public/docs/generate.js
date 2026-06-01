/* ------------------------------------------------------------------ *
 * Enterprise catalog generator for the GEGIS Library ServiceNow components.
 *
 * Reads each component's now-ui.json (+ tile-icon SVG + optional screenshot in
 * ./screens/<slug>.png) and emits a single self-contained index.html — ready for
 * Netlify.  node generate.js
 * ------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMPONENTS_DIR = path.join(ROOT, 'components');
const SCREENS_DIR = path.join(__dirname, 'screens');

const PREFERRED = [
	'product-selector',
	'selected-product',
	'quote-comparison',
	'quote-action-bar',
	'peril-deductibles',
	'metric-card',
];

const discovered = fs
	.readdirSync(COMPONENTS_DIR)
	.filter((d) => {
		if (d.startsWith('_') || d.startsWith('.')) return false; // skip helpers (e.g. _gallery)
		try {
			return (
				fs.statSync(path.join(COMPONENTS_DIR, d)).isDirectory() &&
				fs.existsSync(path.join(COMPONENTS_DIR, d, 'now-ui.json'))
			);
		} catch (e) {
			return false;
		}
	});
const ORDER = [...PREFERRED.filter((d) => discovered.includes(d)), ...discovered.filter((d) => !PREFERRED.includes(d)).sort()];

/* Rich sample inputs for json properties whose now-ui.json carries no rich default. */
const SAMPLE_OVERRIDES = {
	'x-gegis-library-product-selector': {
		options: [
			{ id: 'commercial-standard', title: 'Commercial Property – Standard Plan', pill: 'AI Recommended', pillTone: 'info', pillIcon: 'sparkles-outline', subtitle: 'Why we recommend:', bullets: ['Matches industry: Manufacturing', 'Covers key risks: Fire, Machinery', 'Within underwriting guidelines', 'Balanced premium vs coverage'] },
			{ id: 'commercial-premium', title: 'Commercial Property – Premium Plan', pill: 'Best Coverage', pillTone: 'positive', pillIcon: 'shield-outline', subtitle: "What's included:", bullets: ['Full replacement-cost cover', 'Equipment breakdown included', '24/7 priority claims handling'] },
			{ id: 'flood', title: 'Flood Insurance', pill: 'Higher Protection', pillTone: 'neutral', bullets: [] },
			{ id: 'business', title: 'Business Interruption', pill: 'Lower Premium', pillTone: 'neutral', bullets: [] },
			{ id: 'cyber', title: 'Cyber Liability', pill: 'Add-on', pillTone: 'warning', bullets: [] },
		],
	},
	'x-gegis-library-quote-comparison': {
		versions: [
			{ header: { title: 'Quote Versions Comparison', option: 'Version 1', status: { label: 'Current', color: 'gray' }, selectable: true }, sections: [{ sectionName: 'Overview', type: 'header_summary', fields: [{ label: 'Effective date', value: '2026-07-01', displayType: 'text', formatted: 'Jul 1, 2026' }, { label: 'AI recommended', value: false, displayType: 'tick_cross' }] }, { sectionName: 'Coverage', type: 'coverage', fields: [{ label: 'Property Damage', value: true, displayType: 'tick_cross' }, { label: 'Business Interruption', value: true, displayType: 'tick_cross' }, { label: 'Flood', value: false, displayType: 'tick_cross' }] }, { sectionName: 'Premium', type: 'premium', fields: [{ label: 'Total Annual Premium', value: 45100, displayType: 'currency_bold', isAggregation: true, formatted: '$45,100' }] }], actions: [{ label: 'Select', style: 'primary' }] },
			{ header: { option: 'Version 2', status: { label: 'Recommended', color: 'green' }, selectable: true }, sections: [{ sectionName: 'Overview', type: 'header_summary', fields: [{ label: 'Effective date', value: '2026-07-01', displayType: 'text', formatted: 'Jul 1, 2026' }, { label: 'AI recommended', value: true, displayType: 'tick_cross' }] }, { sectionName: 'Coverage', type: 'coverage', fields: [{ label: 'Property Damage', value: true, displayType: 'tick_cross' }, { label: 'Business Interruption', value: true, displayType: 'tick_cross' }, { label: 'Flood', value: true, displayType: 'tick_cross' }] }, { sectionName: 'Premium', type: 'premium', fields: [{ label: 'Total Annual Premium', value: 51000, displayType: 'currency_bold', isAggregation: true, formatted: '$51,000', trend: { direction: 'increase', vsBaseline: { formatted: '+$5,900', color: 'red' } } }] }], actions: [{ label: 'Select', style: 'primary' }] },
		],
	},
};

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pretty = (v) => JSON.stringify(v, null, 2);

function readIcon(slug) {
	const dir = path.join(COMPONENTS_DIR, slug, 'tile-icon');
	try {
		const svg = fs.readdirSync(dir).find((f) => f.endsWith('.svg'));
		if (svg) return fs.readFileSync(path.join(dir, svg), 'utf8');
	} catch (e) {}
	return '<svg viewBox="0 0 48 48"><rect x="8" y="8" width="32" height="32" rx="6" fill="none" stroke="#474747" stroke-width="2.5"/></svg>';
}

function hasScreenshot(slug) {
	try {
		return fs.existsSync(path.join(SCREENS_DIR, slug + '.png'));
	} catch (e) {
		return false;
	}
}

const codeBlock = (id, json) => `<div class="code"><button class="copy" data-target="${id}">Copy</button><pre id="${id}"><code>${esc(json)}</code></pre></div>`;

function typeLabel(p) {
	const t = p.fieldType || 'string';
	if (t === 'choice' && p.typeMetadata && Array.isArray(p.typeMetadata.choices)) {
		return `choice <span class="muted">(${esc(p.typeMetadata.choices.map((c) => c.value).join(' · '))})</span>`;
	}
	return esc(t);
}
function defaultCell(p) {
	if (p.defaultValue === undefined) return '<span class="muted">—</span>';
	if (p.fieldType === 'json' || typeof p.defaultValue === 'object') return `<span class="muted">see sample ▾</span>`;
	if (typeof p.defaultValue === 'boolean') return `<code>${p.defaultValue}</code>`;
	return `<code>${esc(p.defaultValue)}</code>`;
}
function propsTable(props) {
	if (!props.length) return '<p class="muted">No configurable properties.</p>';
	const rows = props.map((p) => `<tr><td><code>${esc(p.name)}</code></td><td>${esc(p.label || '')}</td><td>${typeLabel(p)}</td><td>${defaultCell(p)}</td><td>${esc(p.description || '')}</td></tr>`).join('\n');
	return `<table class="tbl"><thead><tr><th>Property</th><th>Label</th><th>Type</th><th>Default</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function payloadList(payload) {
	if (!Array.isArray(payload) || !payload.length) return '<span class="muted">no payload</span>';
	return payload.map((f) => `<code>${esc(f.name)}</code><span class="muted">:${esc(f.fieldType || 'string')}</span>`).join(' &nbsp; ');
}
function eventsTable(actions) {
	if (!actions.length) return '<p class="muted">No external events — this component has no state an outside page needs to bind.</p>';
	const rows = actions.map((a) => `<tr><td><code>${esc(a.name)}</code></td><td>${esc(a.label || '')}</td><td>${payloadList(a.payload)}</td><td>${esc(a.description || '')}</td></tr>`).join('\n');
	return `<table class="tbl"><thead><tr><th>Event</th><th>Label</th><th>Payload</th><th>When / use</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function samples(props, tag, slug) {
	const overrides = SAMPLE_OVERRIDES[tag] || {};
	const blocks = [];
	props.forEach((p) => {
		const isJson = p.fieldType === 'json' || (p.defaultValue && typeof p.defaultValue === 'object');
		if (!isJson) return;
		const val = overrides[p.name] !== undefined ? overrides[p.name] : p.defaultValue;
		if (val === undefined) return;
		blocks.push(`<h4><code>${esc(p.name)}</code>${overrides[p.name] !== undefined ? ' <span class="badge">sample</span>' : ''}</h4>${codeBlock(slug + '-' + p.name, pretty(val))}`);
	});
	return blocks.length ? `<h3>Sample input JSON</h3>${blocks.join('\n')}` : '';
}

function entry(slug) {
	const json = JSON.parse(fs.readFileSync(path.join(COMPONENTS_DIR, slug, 'now-ui.json'), 'utf8'));
	const tag = Object.keys(json.components)[0];
	return { slug, tag, c: json.components[tag] };
}

function section({ slug, tag, c }) {
	const ui = c.uiBuilder || {};
	const props = c.properties || [];
	const actions = c.actions || c.events || [];
	const usesLegacyEvents = !c.actions && (c.events || []).length > 0;
	const inner = c.innerComponents || [];
	const innerChips = inner.length ? inner.map((n) => `<span class="chip chip-now">${esc(n)}</span>`).join(' ') : '<span class="muted">none — fully custom</span>';

	const legacyNote = usesLegacyEvents
		? `<p class="warn">⚠ Declared under the legacy <code>events</code> key — migrate to <code>actions</code> so these appear in the UI Builder <em>Events</em> tab.</p>`
		: '';

	const shot = hasScreenshot(slug)
		? `<figure class="shot"><img src="screens/${esc(slug)}.png" alt="${esc(ui.label || tag)} preview" loading="lazy" onerror="this.closest('figure').remove()"><figcaption>Sample preview (local).</figcaption></figure>`
		: '';

	return `
  <section class="comp" id="${esc(slug)}">
    <div class="comp-head">
      <span class="comp-icon">${readIcon(slug)}</span>
      <div class="comp-head-main">
        <h2>${esc(ui.label || tag)}</h2>
        <div class="tags">
          <span class="chip chip-tag">&lt;${esc(tag)}&gt;</span>
          ${ui.category ? `<span class="chip">${esc(ui.category)}</span>` : ''}
          <span class="chip">${props.length} props</span>
          <span class="chip">${actions.length} events</span>
        </div>
      </div>
    </div>
    <p class="desc">${esc(ui.description || '')}</p>
    <p class="inner"><strong>Standard components used:</strong> ${innerChips}</p>
    ${shot}
    <h3>Properties</h3>
    ${propsTable(props)}
    <h3>Events</h3>
    ${legacyNote}
    ${eventsTable(actions)}
    ${samples(props, tag, slug)}
  </section>`;
}

const entries = ORDER.map(entry);
const sections = entries.map(section).join('\n');
const nav = entries.map((e) => `<a href="#${esc(e.slug)}"><span class="nav-ic">${readIcon(e.slug)}</span>${esc(e.c.uiBuilder ? e.c.uiBuilder.label : e.tag)}</a>`).join('\n');
const totalEvents = entries.reduce((n, e) => n + (e.c.actions || e.c.events || []).length, 0);
const built = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>GEGIS Library — ServiceNow Component Catalog</title>
<meta name="description" content="Enterprise catalog of x_gegis_library ServiceNow Next Experience components: properties, events, and sample inputs." />
<style>
  :root{--bg:#f4f6f9;--surface:#fff;--ink:#1b2333;--muted:#6b7488;--line:#e4e8ee;--accent:#2f6fed;--accent-soft:#eef3ff;--code-bg:#0f172a;--code-ink:#e2e8f0;--ok:#16794e}
  *{box-sizing:border-box}
  body{margin:0;font-family:'Lato',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--ink);background:var(--bg);line-height:1.5}
  a{color:var(--accent);text-decoration:none}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.86em;background:#eef0f4;border-radius:4px;padding:1px 5px;color:#243049}
  .wrap{display:grid;grid-template-columns:284px 1fr;min-height:100vh}
  .side{position:sticky;top:0;align-self:start;height:100vh;overflow:auto;background:var(--surface);border-right:1px solid var(--line);padding:22px 16px}
  .brand{display:flex;align-items:center;gap:10px;margin:0 0 2px}
  .brand .logo{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#2f6fed,#1e40af);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px}
  .brand b{font-size:16px}
  .side .scope{font-size:12px;color:var(--muted);margin:2px 0 16px 44px}
  .side nav{display:flex;flex-direction:column;gap:1px}
  .side nav a{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:8px;color:#2a3242;font-size:13.5px}
  .side nav a:hover{background:var(--accent-soft);color:var(--accent)}
  .side nav a .nav-ic{width:18px;height:18px;flex:0 0 18px;display:inline-flex}
  .side nav a .nav-ic svg{width:18px;height:18px}
  .side .note{margin-top:18px;font-size:12px;color:var(--muted);border-top:1px solid var(--line);padding-top:12px}
  main{padding:40px 52px;max-width:1120px}
  header.hero h1{font-size:30px;margin:0 0 8px;letter-spacing:-.01em}
  header.hero p.lead{color:var(--muted);margin:0 0 16px;max-width:780px;font-size:15px}
  .stats{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 18px}
  .stat{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 16px}
  .stat b{display:block;font-size:20px}
  .stat span{font-size:12px;color:var(--muted)}
  .rules{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin-top:6px}
  .rules h3{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
  .rules ul{margin:0;padding-left:18px;font-size:13.5px}.rules li{margin:4px 0}
  .comp{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:26px 28px;margin:26px 0;scroll-margin-top:18px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
  .comp-head{display:flex;align-items:center;gap:14px}
  .comp-icon{width:44px;height:44px;flex:0 0 44px;border-radius:11px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center}
  .comp-icon svg{width:26px;height:26px}
  .comp-head-main{flex:1;min-width:0}
  .comp-head h2{margin:0 0 5px;font-size:21px}
  .tags{display:flex;gap:6px;flex-wrap:wrap}
  .chip{display:inline-block;font-size:12px;padding:3px 9px;border-radius:999px;background:#eef0f4;color:#3a4554;white-space:nowrap}
  .chip-tag{background:#11203a;color:#cfe0ff;font-family:ui-monospace,monospace}
  .chip-now{background:var(--accent-soft);color:var(--accent)}
  .desc{color:#3a4554;margin:12px 0 6px}
  .inner{font-size:13.5px;color:#3a4554;margin:6px 0 4px}
  .comp h3{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:22px 0 8px}
  .comp h4{margin:14px 0 5px;font-size:13.5px}
  .muted{color:var(--muted)}
  .badge{font-size:10px;background:#fde9c8;color:#92560d;border-radius:4px;padding:1px 6px;text-transform:uppercase;letter-spacing:.03em}
  .warn{background:#fff6e6;border:1px solid #f3d28a;color:#7a4d06;border-radius:8px;padding:8px 12px;font-size:13px;margin:2px 0 8px}.warn code{background:#f6e6c3}
  .shot{margin:14px 0 4px;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fafbfc}
  .shot img{display:block;width:100%;height:auto}
  .shot figcaption{font-size:11.5px;color:var(--muted);padding:6px 12px;border-top:1px solid var(--line);background:#fff}
  table.tbl{width:100%;border-collapse:collapse;font-size:13.5px;margin:4px 0 6px}
  table.tbl th{text-align:left;background:#f7f8fa;border-bottom:2px solid var(--line);padding:8px 10px;font-size:11.5px;color:#54607a;text-transform:uppercase;letter-spacing:.03em}
  table.tbl td{border-bottom:1px solid var(--line);padding:8px 10px;vertical-align:top}
  table.tbl tr:hover td{background:#fafbfc}
  .code{position:relative;margin:6px 0 10px}
  .code pre{background:var(--code-bg);color:var(--code-ink);border-radius:10px;padding:16px;overflow:auto;font-size:12.5px;line-height:1.55;margin:0}
  .code code{background:none;color:inherit;padding:0}
  .copy{position:absolute;top:10px;right:10px;background:#1e293b;color:#cbd5e1;border:1px solid #334155;border-radius:6px;font-size:11px;padding:4px 9px;cursor:pointer}
  .copy:hover{background:#334155;color:#fff}.copy.done{background:var(--ok);border-color:var(--ok);color:#fff}
  footer{color:var(--muted);font-size:13px;padding:24px 0 8px;border-top:1px solid var(--line);margin-top:14px}
  @media(max-width:880px){.wrap{grid-template-columns:1fr}.side{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}main{padding:24px}}
</style>
</head>
<body>
<div class="wrap">
  <aside class="side">
    <p class="brand"><span class="logo">GG</span><b>GEGIS Library</b></p>
    <p class="scope">scope: x_gegis_library</p>
    <nav>
      <a href="#top">Overview</a>
      ${nav}
    </nav>
    <p class="note">ServiceNow Next Experience custom components — each composes standard Horizon <code>now-*</code> components and is configured + bound entirely through UI Builder.</p>
  </aside>

  <main id="top">
    <header class="hero">
      <h1>ServiceNow Component Catalog</h1>
      <p class="lead">Reference for the <strong>x_gegis_library</strong> Next Experience components — configuration properties, dispatched events (with payloads), and copy-paste sample inputs.</p>
      <div class="stats">
        <div class="stat"><b>${entries.length}</b><span>Components</span></div>
        <div class="stat"><b>${totalEvents}</b><span>Bindable events</span></div>
        <div class="stat"><b>x_gegis_library</b><span>Scope</span></div>
      </div>
      <div class="rules">
        <h3>How these components work</h3>
        <ul>
          <li><strong>Composition:</strong> built from standard Horizon <code>now-*</code> components, customized via properties / slots / design tokens — never hand-rolled.</li>
          <li><strong>Configuration:</strong> every property below is set in UI Builder and bindable to data resources / client state.</li>
          <li><strong>Events:</strong> declared as <code>actions</code> so they appear in the UI Builder <em>Events</em> tab. Only events an external page needs to bind are exposed — purely internal UI state isn't.</li>
        </ul>
      </div>
    </header>

    ${sections}

    <footer>Generated from each component's <code>now-ui.json</code> · ${entries.length} components · built ${built} · scope <code>x_gegis_library</code>.</footer>
  </main>
</div>
<script>
  document.querySelectorAll('.copy').forEach(function(btn){
    btn.addEventListener('click', function(){
      var el=document.getElementById(btn.dataset.target), text=el?el.innerText:'';
      navigator.clipboard.writeText(text).then(function(){var o=btn.textContent;btn.textContent='Copied!';btn.classList.add('done');setTimeout(function(){btn.textContent=o;btn.classList.remove('done');},1400);});
    });
  });
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, 'index.html'), html, 'utf8');
console.log('Wrote index.html (' + html.length + ' bytes) · ' + entries.length + ' components · screenshots: ' + entries.filter((e) => hasScreenshot(e.slug)).length + '/' + entries.length);
