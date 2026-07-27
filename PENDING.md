# Pending Tasks

## Responsive images (srcset) for further mobile/desktop performance gains

**Status:** Not started — explicitly deferred, do only when asked.

**Context:** After the mobile performance pass (WebP conversion, deferred
support.js, async font loading — see git log), PageSpeed Insights still
flags "Improve image delivery" as an opportunity:

- Mobile: ~66 KiB potential savings
- Desktop: ~108 KiB potential savings

The 3 images in `frontend/uploads/` are currently served as single
900px-wide WebP files to every device. PageSpeed's actual measured
displayed sizes are smaller and differ by device:

| Image | Mobile displayed | Desktop displayed |
|---|---|---|
| Hero photo (`..._202607101351.webp`) | 550×550 | 374×374 |
| Instructor card (`image.png_2K...webp`) | 703×525 | 460×343 |
| Why-learn section (`..._202607101354.webp`) | 651×486 | 400×299 |

**What the fix involves:** generate 2-3 resolution variants per image
(e.g. 400w/700w/900w), add `srcset` + a `sizes` attribute to each `<img>`
matching the actual CSS breakpoint widths, and let the browser pick the
right file per visitor's viewport width and screen pixel density.

**Why deferred:** meaningfully more setup effort (multiple files per
image, accurate `sizes` values matching real layout breakpoints) for a
comparatively small remaining gain, after the earlier fixes already cut
total image weight by ~95%. Worth doing eventually, not urgent.
