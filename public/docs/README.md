# GEGIS Library — ServiceNow Component Catalog (static site)

A single self-contained `index.html` documenting every `x_gegis_library` component:
description, **properties**, **events + payloads**, the **standard `now-*`** it composes,
and copy-paste **sample input JSON**. No build step, no dependencies.

## Regenerate

`index.html` is generated from each component's `now-ui.json` (+ its `tile-icon/*.svg`
for the icon, + `screens/<slug>.png` for the preview if present):

```bash
node generate.js
```

Re-run it whenever a component's properties or events change, then redeploy.

## Screenshots (`screens/`)

Each `screens/<component>.png` is an element-only preview captured from the dev-only
harness at `../components/_gallery` (renders every component on one page). To refresh:

```bash
cd ../components/_gallery && snc ui-component develop --port 8085
# then capture each #frame-<tag> element into docs-site/screens/<slug>.png, and:
cd ../../docs-site && node generate.js
```

> Previews are from the **local** dev server, so components that compose `now-*` show
> the *legacy* npm styling; fully-custom components show their true look. Validate the
> Horizon appearance on the instance.

## Deploy to Netlify

This folder *is* the site. Any of these work:

- **Drag & drop:** zip this `docs-site` folder (or just `index.html`) and drop it on
  https://app.netlify.com/drop.
- **CLI:**
  ```bash
  npm i -g netlify-cli
  netlify deploy --dir=. --prod
  ```
- **Git:** point a Netlify site at the repo with **base directory** `now-components/docs-site`
  (the included `netlify.toml` sets `publish = "."` and no build command).

## Contents

| File | Purpose |
| --- | --- |
| `index.html` | The generated catalog (deploy this). |
| `generate.js` | Reads the components' `now-ui.json` and writes `index.html`. |
| `netlify.toml` | Publish config (static, no build). |
