"""Inline the AquaCare phone app page into one self-contained HTML file.

Usage:  python tools/build_phone.py
Output: dist/aquacare-phone-standalone.html
Shares js/css with the main page; it never writes the main page or its build output.
"""
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "phone.html").read_text(encoding="utf-8")


def inline_css(m):
    return "<style>\n" + (root / m.group(1)).read_text(encoding="utf-8") + "\n</style>"


def inline_js(m):
    js = (root / m.group(1)).read_text(encoding="utf-8").replace("</script", "<\\/script")
    return "<script>\n" + js + "\n</script>"


html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: inline_css(m), html)
html = re.sub(r'<script src="([^"]+)"></script>', lambda m: inline_js(m), html)

out = root / "dist" / "aquacare-phone-standalone.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print(f"Wrote {out} ({out.stat().st_size // 1024} KB)")
