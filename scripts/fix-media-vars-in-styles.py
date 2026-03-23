#!/usr/bin/env python3
"""Replace var() tokens inside @media with literal px (CSS custom props are invalid in media queries)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / "public" / "styles.css"

MEDIA_VAR = {
    "var(--bp-xs)": "480px",
    "var(--bp-sm)": "600px",
    "var(--bp-md)": "720px",
    "var(--bp-md-tab)": "768px",
    "var(--bp-lg)": "860px",
    "var(--bp-lg-2)": "880px",
    "var(--bp-xl)": "900px",
    "var(--bp-xl-2)": "920px",
    "var(--bp-2xl)": "960px",
    "var(--bp-3xl)": "980px",
    "var(--bp-max-lg)": "1100px",
    "var(--bp-max-xl)": "1200px",
    "var(--layout-dim-640)": "640px",
    "var(--layout-dim-879)": "879px",
    "var(--layout-dim-560)": "560px",
    "var(--layout-dim-620)": "620px",
    "var(--layout-dim-520)": "520px",
    "var(--layout-dim-360)": "360px",
    "var(--layout-dim-380)": "380px",
}


def main() -> None:
    text = CSS.read_text(encoding="utf-8")
    lines = text.splitlines(True)
    out = []
    for line in lines:
        s = line
        if "@media" in s:
            for k, v in MEDIA_VAR.items():
                s = s.replace(k, v)
        out.append(s)
    CSS.write_text("".join(out), encoding="utf-8")
    print(f"Updated @media rules in {CSS}")


if __name__ == "__main__":
    main()
