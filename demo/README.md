# E-POCH demo website

A static site (HTML, CSS, JavaScript only) for showing E-POCH to other clinics.

- `index.html`: landing page
- `app.html`: interactive demo of the Reception, Doctor, Pharmacy and Administration workspaces.
  All data is fictional and stays in the visitor's browser (localStorage). The reset button restores it.

## Before sending the link

Edit `js/config.js` to add your phone, WhatsApp and email. The contact section stays hidden until
at least one of them is filled in. The demo clinic's name and consultation fee are set there too.

## Publishing on GitHub Pages

`.github/workflows/demo-pages.yml` publishes **only this folder**. The rest of the repository is not
published to Pages.

1. On GitHub, open the repository's **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main`, or run the "Deploy demo site" workflow from the **Actions** tab.
3. The site appears at `https://<owner>.github.io/<repo>/`.

## Trying it locally

```sh
cd demo && python3 -m http.server 8000
```

Then open http://localhost:8000.
