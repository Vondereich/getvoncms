"""Validate the public source or GitHub Pages artifact without third-party packages."""
import json
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import xml.etree.ElementTree as ET


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.metadata = {}
        self.canonicals = []
        self.ids = []
        self.links = []
        self.assets = []
        self.images = []
        self.schemas = []
        self.navigation = []
        self.footer = []
        self.comparison_buttons = []
        self.comparison_headers = []
        self.comparison_cells = []
        self.in_nav = False
        self.in_footer = False
        self.h1_count = 0
        self.in_title = False
        self.in_schema = False
        self.schema = ""
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "nav":
            self.in_nav = True
        if tag == "footer":
            self.in_footer = True
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "title":
            self.in_title = True
        if tag == "h1":
            self.h1_count += 1
        if tag == "meta":
            name = attrs.get("name") or attrs.get("property")
            if name:
                self.metadata.setdefault(name, []).append(attrs.get("content", ""))
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonicals.append(attrs.get("href"))
        if tag == "link" and attrs.get("rel") in ("stylesheet", "icon", "apple-touch-icon"):
            self.assets.append(attrs.get("href", ""))
        if tag == "a":
            self.links.append(attrs.get("href", ""))
            if self.in_nav:
                self.navigation.append(attrs.get("href", ""))
            if self.in_footer:
                self.footer.append(attrs.get("href", ""))
        if tag == "script":
            self.in_schema = attrs.get("type") == "application/ld+json"
            self.schema = ""
            if attrs.get("src"):
                self.assets.append(attrs["src"])
        if tag == "img":
            self.images.append(attrs)
            self.assets.append(attrs.get("src", ""))
        if tag == "button" and "data-compare" in attrs:
            self.comparison_buttons.append(attrs)
        if "data-cms" in attrs:
            if tag == "th":
                self.comparison_headers.append(attrs["data-cms"])
            elif tag == "td":
                self.comparison_cells.append(attrs)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == "nav":
            self.in_nav = False
        if tag == "footer":
            self.in_footer = False
        if tag == "title":
            self.in_title = False
        if tag == "script" and self.in_schema:
            self.schemas.append(json.loads(self.schema))
            self.in_schema = False

    def handle_data(self, value):
        if self.in_title:
            self.title += value
        if self.in_schema:
            self.schema += value


def check(root):
    names = ("index.html", "docs.html", "philosophy.html", "whats-new.html")
    pages = {name: Page((root / name).read_text(encoding="utf-8")) for name in names}
    errors = []

    def require(condition, message):
        if not condition:
            errors.append(message)

    for name, page in pages.items():
        canonical = "https://getvoncms.com/" + ("" if name == "index.html" else name)
        require(page.h1_count == 1, f"{name}: expected one H1")
        require(len(page.ids) == len(set(page.ids)), f"{name}: duplicate IDs")
        require(0 < len(page.title) <= 65, f"{name}: missing or overlong title")
        description = page.metadata.get("description", [])
        require(len(description) == 1 and 100 <= len(description[0]) <= 170,
                f"{name}: expected one natural description, 100-170 characters")
        require(page.canonicals == [canonical], f"{name}: canonical mismatch")
        for key, expected in (
            ("og:title", page.title), ("twitter:title", page.title),
            ("og:description", description[0] if description else ""),
            ("twitter:description", description[0] if description else ""),
            ("og:url", canonical), ("twitter:url", canonical),
        ):
            require(page.metadata.get(key) == [expected], f"{name}: {key} mismatch")
        require(page.metadata.get("robots") == ["index, follow, max-image-preview:large"],
                f"{name}: robots mismatch")
        require(bool(page.schemas), f"{name}: missing structured data")
        require(page.metadata.get("og:image") == page.metadata.get("twitter:image"),
                f"{name}: social image mismatch")
        require("page-content" in page.ids, f"{name}: missing skip-link target")
        require(page.navigation == pages["index.html"].navigation, f"{name}: navigation differs from homepage")
        require(page.footer == pages["index.html"].footer, f"{name}: footer differs from homepage")
        for image in page.images:
            require("alt" in image, f"{name}: image missing alt: {image.get('src')}")
            if not urlsplit(image.get("src", "")).scheme:
                require(all(str(image.get(key, "")).isdigit() and int(image[key]) > 0
                            for key in ("width", "height")),
                        f"{name}: local image missing dimensions: {image.get('src')}")
        for asset in page.assets:
            url = urlsplit(asset)
            if url.scheme or url.netloc:
                require(url.scheme == "https", f"{name}: unsafe asset URL: {asset}")
                continue
            require(bool(url.path) and (root / unquote(url.path)).is_file(),
                    f"{name}: missing asset: {asset}")
        for href in page.links:
            url = urlsplit(href)
            if url.scheme or url.netloc:
                require(url.scheme in ("https", "mailto"), f"{name}: unsafe link: {href}")
                continue
            target = unquote(url.path) or name
            require((root / target).is_file(), f"{name}: missing link target: {href}")
            if url.fragment:
                require(target in pages and unquote(url.fragment) in pages[target].ids,
                        f"{name}: missing anchor: {href}")
        print(f"{name}: title {len(page.title)} chars, description {len(description[0]) if description else 0} chars")

    require(len({p.title for p in pages.values()}) == len(pages), "Duplicate page titles")
    require(len({p.metadata.get('description', [''])[0] for p in pages.values()}) == len(pages),
            "Duplicate descriptions")
    home = pages["index.html"]
    comparison_keys = ["wordpress", "ghost", "emdash", "grav", "strapi", "payload", "october"]
    require([b["data-compare"] for b in home.comparison_buttons] == comparison_keys,
            "Homepage: comparison controls missing or duplicated")
    require(home.comparison_headers == comparison_keys,
            "Homepage: comparison column headings do not match controls")
    require(sum(b.get("aria-pressed") == "true" for b in home.comparison_buttons) == 1,
            "Homepage: expected one selected comparison")
    for key in comparison_keys:
        cells = [c for c in home.comparison_cells if c["data-cms"] == key]
        require(len(cells) == 4 and all(c.get("data-label") for c in cells),
                f"Homepage: incomplete or unlabeled comparison for {key}")
    required_guides = {
        "API.md", "CUSTOM_FONTS.md", "DATABASE_MANAGER.md", "EXTENSION_DEVELOPMENT.md",
        "FEATURES.md", "INSTALL.md", "LICENSE.md", "MANUAL.md", "ROUTING.md",
        "SECURITY.md", "UPGRADE.md", "VPS.md",
    }
    linked_guides = {Path(urlsplit(href).path).name for href in pages["docs.html"].links
                     if "/Vondereich/VonCMS/blob/main/docs/" in href}
    require(required_guides <= linked_guides, "Documentation map omits an official guide")
    software = next((s for s in home.schemas if s.get("@type") == "SoftwareApplication"), {})
    require(bool(software.get("softwareVersion")), "Homepage: missing software version")
    release = pages["whats-new.html"]
    release_version = next((v for v in release.ids if v == "release-title"), None)
    require(bool(release_version), "Release page: missing static release heading")
    require((root / "robots.txt").is_file(), "Missing robots.txt")
    sitemap = ET.parse(root / "sitemap.xml")
    locations = {node.text for node in sitemap.findall(".//{*}loc")}
    require(locations == {"https://getvoncms.com/" + ("" if n == "index.html" else n) for n in names},
            "Sitemap does not match public pages")
    require("Sitemap: https://getvoncms.com/sitemap.xml" in (root / "robots.txt").read_text(),
            "robots.txt missing sitemap")
    if errors:
        raise SystemExit("\n".join(errors))
    print("PASS: four public pages, unique SEO metadata, structured data, local links/assets, robots and sitemap.")


if __name__ == "__main__":
    check(Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent)
