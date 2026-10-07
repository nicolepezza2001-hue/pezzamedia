# Pezza Media

Website for pezzamedia.com: Nicole Pezza, freelance copywriter and Klaviyo specialist.

A single static page with no build step. `dist/` is the website root, and every push to `main`
publishes it to GitHub Pages (`.github/workflows/deploy-pages.yml`).

## Where things are

- `dist/index.html`: all the page copy, section by section (hero, About, Services, Portfolio,
  Let's talk business stats, client reviews, contact form, footer). Edit text here.
- `dist/assets/style.css`: all styling. Brand colours and the font (EB Garamond) are set at the top in `:root`:
  cream #FBF4D7, pink #DBC2CF, navy #141B41, green #9CDE9F (hover #7DE282).
- `dist/assets/site.js`: mobile menu, typing headline, carousels, contact form.
- `dist/assets/`: images (client logos, portrait, stamps, hand-drawn underlines and vines).

## Common edits

- **Change copy**: edit the text in `dist/index.html`. Keep `<b>`/`<strong>` for the bold phrases.
- **Add a portfolio project**: copy one `<article class="project-card">` block inside `#projects`.
- **Add a review**: copy one `<blockquote class="review-card">` block inside `#reviews`.
- **Add a client logo**: put a square PNG (about 200×200) in `dist/assets/` and add an `<li>` to `.logo-track`.
- **Hero stat badges** (`laurel-*.svg`) have their numbers drawn into the image, so new numbers need new badge images.

## Contact form

The form posts to [FormSubmit](https://formsubmit.co) (free, no account), which emails the address in
`data-email` on the `<form>` tag. The very first submission sends a one-time activation email to that
address; click the link in it and later submissions arrive normally.

## History

The site previously ran on WordPress + Elementor. `old-site/` is a snapshot of that site taken before the
move, kept for reference only (it is not published). `.github/workflows/snapshot-old-site.yml` is the
one-off job that took the snapshot.
