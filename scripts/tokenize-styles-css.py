#!/usr/bin/env python3
"""Replace Npx literals in public/styles.css with theme.css tokens.

After running, fix @media rules: browsers do not resolve var() in media queries.
Run: python3 scripts/fix-media-vars-in-styles.py (or replace @media (max-width: var(--bp-*)) with px literals).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / "public" / "styles.css"

PX_MAP = {
    "1200px": "var(--bp-max-xl)",
    "1100px": "var(--bp-max-lg)",
    "999px": "var(--border-radius-full)",
    "980px": "var(--bp-3xl)",
    "960px": "var(--bp-2xl)",
    "920px": "var(--bp-xl-2)",
    "900px": "var(--bp-xl)",
    "880px": "var(--bp-lg-2)",
    "879px": "var(--layout-dim-879)",
    "860px": "var(--bp-lg)",
    "820px": "var(--layout-dim-820)",
    "768px": "var(--bp-md-tab)",
    "720px": "var(--bp-md)",
    "680px": "var(--layout-dim-680)",
    "640px": "var(--layout-dim-640)",
    "620px": "var(--layout-dim-620)",
    "600px": "var(--bp-sm)",
    "560px": "var(--layout-dim-560)",
    "540px": "var(--layout-dim-540)",
    "520px": "var(--layout-dim-520)",
    "480px": "var(--bp-xs)",
    "440px": "var(--layout-dim-440)",
    "420px": "var(--layout-dim-420)",
    "400px": "var(--layout-dim-400)",
    "380px": "var(--layout-dim-380)",
    "360px": "var(--layout-dim-360)",
    "320px": "var(--layout-dim-320)",
    "300px": "var(--layout-dim-300)",
    "280px": "var(--layout-dim-280)",
    "240px": "var(--layout-dim-240)",
    "220px": "var(--layout-dim-220)",
    "200px": "var(--layout-dim-200)",
    "180px": "var(--layout-dim-180)",
    "160px": "var(--layout-dim-160)",
    "140px": "var(--layout-dim-140)",
    "128px": "var(--layout-dim-128)",
    "120px": "var(--layout-dim-120)",
    "112px": "var(--layout-dim-112)",
    "100px": "var(--space-12-5)",
    "96px": "var(--layout-dim-96)",
    "88px": "var(--space-11)",
    "80px": "var(--space-10)",
    "76px": "var(--space-9-5)",
    "72px": "var(--space-9)",
    "66px": "var(--space-8-5)",
    "64px": "var(--space-8)",
    "60px": "var(--space-7-5)",
    "56px": "var(--space-7)",
    "52px": "var(--space-6-5)",
    "48px": "var(--space-touch)",
    "46px": "var(--space-5-75)",
    "44px": "var(--space-5-5)",
    "42px": "var(--space-5-25)",
    "40px": "var(--space-5)",
    "38px": "var(--space-4-75)",
    "36px": "var(--space-4-5)",
    "34px": "var(--space-4-25)",
    "32px": "var(--space-4)",
    "30px": "var(--space-3-75)",
    "28px": "var(--space-3-5)",
    "26px": "var(--space-3-25)",
    "24px": "var(--space-3)",
    "22px": "var(--space-2-75)",
    "20px": "var(--space-2-5)",
    "18px": "var(--space-2-25)",
    "17px": "var(--space-2-125)",
    "16px": "var(--space-2)",
    "15px": "var(--space-1-875)",
    "14px": "var(--space-1-75)",
    "13px": "var(--space-1-625)",
    "12px": "var(--space-1-5)",
    "11px": "var(--space-1-375)",
    "10px": "var(--space-1-25)",
    "9px": "var(--space-1-125)",
    "8px": "var(--space-1)",
    "6px": "var(--space-0-75)",
    "5px": "var(--space-0-625)",
    "4px": "var(--space-half)",
    "3px": "var(--border-width-thick)",
    "2px": "var(--border-width-medium)",
    "1px": "1px",
    "0px": "0",
}

PX_RE = re.compile(r"(?<![\w.-])(\d+)px(?![\w.-])")


def replace_px(m: re.Match) -> str:
    key = m.group(0)
    if key in PX_MAP:
        return PX_MAP[key]
    print(f"[tokenize-styles-css] Unmapped: {key}", file=sys.stderr)
    return key


def main() -> None:
    text = CSS.read_text(encoding="utf-8")
    out, n = PX_RE.subn(replace_px, text)
    CSS.write_text(out, encoding="utf-8")
    print(f"Wrote {CSS} ({n} px literals processed)")


if __name__ == "__main__":
    main()
