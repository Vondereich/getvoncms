"""Build Pages HTML with local styles inlined, preserving the editable source files."""
import argparse
from datetime import date
from html import escape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
from urllib.parse import unquote, urljoin, urlsplit, urlunsplit
import xml.etree.ElementTree as ET


PAGES = ("index.html", "docs.html", "philosophy.html", "whats-new.html", "roadmap.html",
         "guides.html", "start-a-news-website.html", "wordpress-alternative-for-news.html", "newspack-alternative.html",
         "enterprise-news-cms-alternative.html")
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


class PageMarkup(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.links = []
        self.home_links = []
        self.schema = None
        self.release_modified = None
        self.line_offsets = [0]
        for line in source.splitlines(keepends=True):
            self.line_offsets.append(self.line_offsets[-1] + len(line))
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.schema = []
        stylesheet = tag == "link" and attrs.get("rel") == "stylesheet"
        href = urlsplit(attrs.get("href", "") or "")
        home_link = tag == "a" and not href.scheme and not href.netloc and href.path in ("index.html", "./index.html")
        if not stylesheet and not home_link:
            return
        if stylesheet and set(attrs) - {"rel", "href", "media"}:
            raise ValueError("Unsupported stylesheet link attributes")
        line, column = self.getpos()
        start = self.line_offsets[line - 1] + column
        if stylesheet:
            self.links.append((start, start + len(self.get_starttag_text()), attrs))
        else:
            attrs["href"] = urlunsplit(("", "", "/", href.query, href.fragment))
            self.home_links.append((start, start + len(self.get_starttag_text()), attrs))

    handle_startendtag = handle_starttag

    def handle_data(self, value):
        if self.schema is not None:
            self.schema.append(value)

    def handle_endtag(self, tag):
        if tag == "script" and self.schema is not None:
            data = json.loads("".join(self.schema))
            if (data.get("@type") == "WebPage"
                    and data.get("url") == "https://getvoncms.com/whats-new.html"
                    and data.get("dateModified")):
                self.release_modified = date.fromisoformat(data["dateModified"][:10])
            self.schema = None


def inline_stylesheets(source, root):
    links = PageMarkup(source).links
    if not links:
        raise ValueError("Expected local stylesheet links in source HTML")
    for start, end, attrs in reversed(links):
        href = attrs["href"]
        media = f' media="{escape(attrs["media"], quote=True)}"' if "media" in attrs else ""
        style = f'<style data-inline-source="{escape(href, quote=True)}"{media}>\n{inline_css(root, href)}\n</style>'
        source = source[:start] + style + source[end:]
    return source


def canonical_home_links(source):
    for start, end, attrs in reversed(PageMarkup(source).home_links):
        attributes = "".join(f" {name}" if value is None else f' {name}="{escape(value, quote=True)}"'
                             for name, value in attrs.items())
        source = source[:start] + f"<a{attributes}>" + source[end:]
    return source


def release_sitemap(source, release_html):
    modified = PageMarkup(release_html).release_modified
    if modified is None:
        return source
    tree = ET.fromstring(source)
    for entry in tree.findall("{*}url"):
        location = entry.find("{*}loc")
        lastmod = entry.find("{*}lastmod")
        if location is None or location.text != "https://getvoncms.com/whats-new.html" or lastmod is None:
            continue
        if modified <= date.fromisoformat(lastmod.text[:10]):
            return source
        lastmod.text = modified.isoformat()
        ET.register_namespace("", "http://www.sitemaps.org/schemas/sitemap/0.9")
        return ET.tostring(tree, encoding="unicode", xml_declaration=True) + "\n"
    raise ValueError("Sitemap is missing the release page or its lastmod")


def build(source, output):
    source, output = source.resolve(), output.resolve()
    if source.is_relative_to(output) or any(output.is_relative_to(source / name) for name in ("css", "js", "upload")):
        raise ValueError("Build output must not overwrite the source or its assets")
    if output.exists() and any(output.iterdir()):
        raise ValueError("Build output directory must be empty")
    html = {name: canonical_home_links(inline_stylesheets((source / name).read_text(encoding="utf-8"), source))
            for name in PAGES}
    sitemap = release_sitemap((source / "sitemap.xml").read_text(encoding="utf-8"), html["whats-new.html"])
    output.mkdir(parents=True, exist_ok=True)
    for name in ASSETS:
        entry = source / name
        if entry.is_dir():
            shutil.copytree(entry, output / name)
        else:
            shutil.copy2(entry, output / name)
    for name, document in html.items():
        (output / name).write_text(document, encoding="utf-8")
    (output / "sitemap.xml").write_text(sitemap, encoding="utf-8")
    print(f"Built {len(PAGES)} static pages with inline CSS: {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", nargs="?", default="_site")
    parser.add_argument("--source", default=Path(__file__).resolve().parent.parent, type=Path)
    args = parser.parse_args()
    build(args.source, Path(args.output))
