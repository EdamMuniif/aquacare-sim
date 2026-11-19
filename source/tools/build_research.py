"""Inline the Research Simulation page into one self-contained HTML file.

Usage:  python tools/build_research.py
Output: dist/aquacare-research-standalone.html
This script never reads or writes the AquaCare v5 page or its build output.
"""
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "research.html").read_text(encoding="utf-8")


def inline_css(m):
    return "<style>\n" + (root / m.group(1)).read_text(encoding="utf-8") + "\n</style>"


def inline_js(m):
    js = (root / m.group(1)).read_text(encoding="utf-8").replace("</script", "<\\/script")
    return "<script>\n" + js + "\n</script>"


html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: inline_css(m), html)
html = re.sub(r'<script src="([^"]+)"></script>', lambda m: inline_js(m), html)

out = root / "dist" / "aquacare-research-standalone.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print(f"Wrote {out} ({out.stat().st_size // 1024} KB)")
