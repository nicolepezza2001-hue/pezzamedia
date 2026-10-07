# Pezza Media

Website for pezzamedia.com: Nicole Pezza, freelance copywriter and Klaviyo specialist.

A single static page, no build step. Serve `dist/` as the website root.

- `dist/index.html`: all the page copy, section by section (About, Services, Portfolio, Stats, Testimonials, Contact).
- `dist/assets/style.css`: layout and brand styles. Brand colours are at the top: cream #FBF4D7, pink #DBC2CF, navy #141B41, green #9CDE9F.
- `dist/assets/`: images (client logos, portrait, icons).

Every push to `main` publishes `dist/` to GitHub Pages (`.github/workflows/deploy-pages.yml`).

To edit copy, change the text inside `dist/index.html` and push. Keep image paths relative (`assets/...`).

## Moving from WordPress

The site previously ran on WordPress + Elementor. `.github/workflows/snapshot-old-site.yml` downloads the old
site into `old-site/` for reference and copies its images into `dist/assets/` using the names in
`tools/old-site-images.txt`. Both can be deleted once the domain points at GitHub Pages.
