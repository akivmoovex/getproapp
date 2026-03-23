# Home hero images

Optimized **WebP** (and **AVIF** for small screens) variants of the marketing hero photo, generated from the same Unsplash source used previously.

- `home-hero-640.avif` / `home-hero-640.webp` — mobile-first LCP
- `home-hero-960.webp` — tablets / small laptops
- `home-hero-1280.webp` — large viewports

Referenced from `views/index.ejs` via `<picture>` + `srcset` / `sizes`.  
To refresh assets after changing the source image, re-fetch with matching `w`, `q`, and `fm` parameters and replace these files.
