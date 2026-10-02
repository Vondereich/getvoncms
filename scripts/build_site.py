"""Build Pages HTML with local styles inlined, preserving the editable source files."""
import argparse
from html import escape
from html.parser import HTMLParser
from pathlib import Path
import re
import shutil
from urllib.parse import unquote, urljoin, urlsplit


PAGES = ("index.html", "docs.html", "philosophy.html", "whats-new.html")
ASSETS = ("CNAME", "robots.txt", "sitemap.xml", "css", "js", "upload")
CSS_URL = re.compile(r"url\(\s*(['\"])([^'\"]+)\1\s*\)", re.IGNORECASE)


def local_asset(root, href):
    url = urlsplit(href)
    if url.scheme or url.netloc or url.path.startswith("/"):
        raise ValueError(f"Expected a relative local asset: {href}")
    target = (root / unquote(url.path)).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        raise ValueError(f"Missing or out-of-root asset: {href}")
    return target


def inline_css(root, href):
    css = local_asset(root, href).read_text(encoding="utf-8")
    if "</style" in css.lower() or re.search(r"@import\b", css, re.IGNORECASE):
        raise ValueError(f"Unsupported inline stylesheet content: {href}")
    # Quoted URLs keep rebasing predictable; reject other forms rather than breaking them.
    if len(CSS_URL.findall(css)) != len(re.findall(r"url\(", css, re.IGNORECASE)):
        raise ValueError(f"CSS URLs must be quoted: {href}")

    def rebase(match):
        quote, value = match.groups()
        url = urlsplit(value)
        if url.scheme or url.netloc or value.startswith(("/", "#")):
            return match.group(0)
        rebased = urljoin(urlsplit(href).path, value)
        local_asset(root, rebased)
        return f"url({quote}{rebased}{quote})"

    return CSS_URL.sub(rebase, css)


class StylesheetLinks(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.links = []
        self.line_offsets = [0]
        for line in source.splitlines(keepends=True):
            self.line_offsets.append(self.line_offsets[-1] + len(line))
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag != "link" or attrs.get("rel") != "stylesheet":
            return
        if set(attrs) - {"rel", "href", "media"}:
            raise ValueError("Unsupported stylesheet link attributes")
        line, column = self.getpos()
        start = self.line_offsets[line - 1] + column
        self.links.append((start, start + len(self.get_starttag_text()), attrs))

    handle_startendtag = handle_starttag


def inline_stylesheets(source, root):
    links = StylesheetLinks(source).links
    if not links:
        raise ValueError("Expected local stylesheet links in source HTML")
    for start, end, attrs in reversed(links):
        href = attrs["href"]
        media = f' media="{escape(attrs["media"], quote=True)}"' if "media" in attrs else ""
        style = f'<style data-inline-source="{escape(href, quote=True)}"{media}>\n{inline_css(root, href)}\n</style>'
        source = source[:start] + style + source[end:]
    return source


def build(source, output):
    source, output = source.resolve(), output.resolve()
    if source.is_relative_to(output) or any(output.is_relative_to(source / name) for name in ("css", "js", "upload")):
        raise ValueError("Build output must not overwrite the source or its assets")
    if output.exists() and any(output.iterdir()):
        raise ValueError("Build output directory must be empty")
    html = {name: inline_stylesheets((source / name).read_text(encoding="utf-8"), source) for name in PAGES}
    output.mkdir(parents=True, exist_ok=True)
    for name in ASSETS:
        entry = source / name
        if entry.is_dir():
            shutil.copytree(entry, output / name)
        else:
            shutil.copy2(entry, output / name)
    for name, document in html.items():
        (output / name).write_text(document, encoding="utf-8")
    print(f"Built four static pages with inline CSS: {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", nargs="?", default="_site")
    parser.add_argument("--source", default=Path(__file__).resolve().parent.parent, type=Path)
    args = parser.parse_args()
    build(args.source, Path(args.output))
