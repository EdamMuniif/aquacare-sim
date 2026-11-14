"""Inline css/ and js/ into one self-contained HTML file.

Usage:  python tools/build_single.py
Output: dist/aquacare-demo-standalone.html  (works offline, double-click to open)
"""
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text(encoding="utf-8")

def inline_css(m):
    css = (root / m.group(1)).read_text(encoding="utf-8")
    return "<style>\n" + css + "\n</style>"

def inline_js(m):
    js = (root / m.group(1)).read_text(encoding="utf-8").replace("</script", "<\\/script")
    return "<script>\n" + js + "\n</script>"

html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)
html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)

out = root / "dist" / "aquacare-demo-standalone.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print(f"Wrote {out} ({out.stat().st_size // 1024} KB)")
