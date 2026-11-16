"""Regression checks for the static Pages builder; no third-party packages needed."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET

from build_site import ASSETS, PAGES, build, canonical_home_links, inline_stylesheets, release_sitemap


class BuildSiteTests(unittest.TestCase):
    def test_roadmap_is_in_public_manifest(self):
        self.assertIn("roadmap.html", PAGES)
        self.assertEqual(len(PAGES), len(set(PAGES)))

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        (self.root / "css").mkdir()
        (self.root / "upload/fonts").mkdir(parents=True)
        (self.root / "upload/fonts/test.woff2").write_bytes(b"wOF2")
        (self.root / "css/test.css").write_text(
            '@font-face { src: url("../upload/fonts/test.woff2"); }\nh1 { color: gold; }',
            encoding="utf-8",
        )

    def test_inline_preserves_markup_and_scripts(self):
        source = ('<!doctype html>\n<head><title>A &amp; B</title>\n'
                  '<link rel="stylesheet" href="css/test.css?v=1" />\n</head>'
                  '<body><h1>A &amp; B</h1><script>const sample = "<link>";</script></body>')
        result = inline_stylesheets(source, self.root)
        self.assertIn('url("upload/fonts/test.woff2")', result)
        self.assertIn('data-inline-source="css/test.css?v=1"', result)
        self.assertIn('<title>A &amp; B</title>', result)
        self.assertEqual(result[result.index("<body>"):], source[source.index("<body>"):])
        self.assertNotIn('rel="stylesheet"', result)

    def test_stylesheet_order_and_media_are_preserved(self):
        (self.root / "css/second.css").write_text("h1 { color: blue; }", encoding="utf-8")
        result = inline_stylesheets(
            '<link rel="stylesheet" href="css/test.css"><link rel="stylesheet" href="css/second.css" media="print">',
            self.root,
        )
        self.assertLess(result.index("color: gold"), result.index("color: blue"))
        self.assertIn('media="print"', result)

    def test_comments_are_not_treated_as_stylesheets(self):
        comment = '<!-- <link rel="stylesheet" href="missing.css"> -->'
        result = inline_stylesheets(comment + '<link rel="stylesheet" href="css/test.css">', self.root)
        self.assertTrue(result.startswith(comment))

    def test_home_links_keep_fragments_queries_and_attributes(self):
        source = ('<a href="index.html" class="brand">Home</a>'
                  '<a href="./index.html?from=nav&amp;view=all#product" aria-current="page">Product</a>')
        result = canonical_home_links(source)
        self.assertEqual(result, '<a href="/" class="brand">Home</a>'
                         '<a href="/?from=nav&amp;view=all#product" aria-current="page">Product</a>')
        self.assertEqual(canonical_home_links(result), result)

    def test_home_links_leave_other_urls_comments_and_scripts_unchanged(self):
        source = ('<a href="https://example.com/index.html">External</a>'
                  '<a href="//example.com/index.html">External</a>'
                  '<a href="docs.html#upgrade">Docs</a><a href="#faq">FAQ</a>'
                  '<a href="/">Home</a><a href="folder/index.html">Other directory</a>'
                  '<!-- <a href="index.html">Comment</a> -->'
                  '<script>const sample = \'<a href="index.html">\';</script>')
        self.assertEqual(canonical_home_links(source), source)

    def test_home_links_escape_attribute_values(self):
        source = '<a href="index.html" title="A &amp; &quot;B&quot;" download>Home</a>'
        self.assertEqual(canonical_home_links(source), '<a href="/" title="A &amp; &quot;B&quot;" download>Home</a>')

    def test_release_sitemap_uses_release_timestamp_without_backdating(self):
        sitemap = ('<?xml version="1.0"?>'
                   '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                   '<url><loc>https://getvoncms.com/</loc><lastmod>2026-11-16</lastmod></url>'
                   '<url><loc>https://getvoncms.com/whats-new.html</loc><lastmod>2026-11-06</lastmod></url>'
                   '</urlset>')
        def release_html(modified):
            return '<script type="application/ld+json">' + json.dumps({
                "@type": "WebPage", "url": "https://getvoncms.com/whats-new.html", "dateModified": modified,
            }) + '</script>'
        updated = release_sitemap(sitemap, release_html("2026-11-14T10:04:49Z"))
        entries = ET.fromstring(updated).findall("{*}url")
        self.assertEqual(entries[0].find("{*}lastmod").text, "2026-11-16")
        self.assertEqual(entries[1].find("{*}lastmod").text, "2026-11-14")
        self.assertEqual(release_sitemap(updated, release_html("2026-11-14T10:04:49Z")), updated)
        self.assertEqual(release_sitemap(updated, release_html("2026-11-08T10:00:00Z")), updated)

    def test_release_sitemap_preserves_existing_dates_without_metadata(self):
        sitemap = '<urlset><url><lastmod>2026-11-14</lastmod></url></urlset>'
        self.assertEqual(release_sitemap(sitemap, '<p>Checked-in release fallback</p>'), sitemap)

    def test_release_sitemap_rejects_invalid_date_or_missing_entry(self):
        for modified in ("2026-02-30", "2026-11-14"):
            html = '<script type="application/ld+json">' + json.dumps({
                "@type": "WebPage", "url": "https://getvoncms.com/whats-new.html", "dateModified": modified,
            }) + '</script>'
            with self.subTest(modified=modified), self.assertRaises(ValueError):
                release_sitemap('<urlset />', html)

    def test_invalid_stylesheet_references_fail_closed(self):
        for href in ("https://example.com/style.css", "//example.com/style.css", "/css/test.css", "../outside.css", "missing.css"):
            with self.subTest(href=href), self.assertRaises(ValueError):
                inline_stylesheets(f'<link rel="stylesheet" href="{href}">', self.root)

    def test_missing_font_fails_closed(self):
        (self.root / "css/test.css").write_text('a { background: url("../upload/missing.png"); }')
        with self.assertRaises(ValueError):
            inline_stylesheets('<link rel="stylesheet" href="css/test.css">', self.root)

    def test_unsupported_css_fails_closed(self):
        for css in ('@import "other.css";', '</style><script>alert(1)</script>', 'a { background: url(image.png); }'):
            with self.subTest(css=css):
                (self.root / "css/test.css").write_text(css)
                with self.assertRaises(ValueError):
                    inline_stylesheets('<link rel="stylesheet" href="css/test.css">', self.root)

    def test_unsupported_attributes_fail_closed(self):
        with self.assertRaises(ValueError):
            inline_stylesheets('<link rel="stylesheet" href="css/test.css" onload="run()">', self.root)

    def test_build_copies_only_the_public_manifest(self):
        for name in PAGES:
            (self.root / name).write_text('<link rel="stylesheet" href="css/test.css"><body><a href="index.html#product">Publication</a></body>')
        for name in ASSETS:
            if name == "js":
                (self.root / name).mkdir()
                (self.root / name / "main.js").write_text("// Example")
            elif not (self.root / name).exists():
                (self.root / name).write_text("Example")
        (self.root / ".git").mkdir()
        (self.root / ".git/config").write_text("Not public")
        (self.root / "private.txt").write_text("Not public")
        output = self.root / "_site"
        build(self.root, output)
        self.assertEqual({p.name for p in output.iterdir()}, set(PAGES + ASSETS))
        self.assertTrue((output / "upload/fonts/test.woff2").is_file())
        self.assertNotIn('rel="stylesheet"', (output / "index.html").read_text())
        self.assertIn('href="/#product"', (output / "docs.html").read_text())
        self.assertIn('href="index.html#product"', (self.root / "docs.html").read_text())
        with self.assertRaises(ValueError):
            build(self.root, output)

    def test_cannot_overwrite_source_or_assets(self):
        for output in (self.root, self.root.parent, self.root / "css/output", self.root / "upload/output"):
            with self.subTest(output=output), self.assertRaises(ValueError):
                build(self.root, output)


class ReleaseSyncTests(unittest.TestCase):
    def test_sync_uses_release_dates_and_keeps_fallback_on_fetch_failure(self):
        workspace = Path(__file__).resolve().parent.parent
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "scripts").mkdir()
            script = root / "scripts/sync-release-fallback.mjs"
            shutil.copy2(workspace / "scripts/sync-release-fallback.mjs", script)
            for page in ("index.html", "whats-new.html"):
                shutil.copy2(workspace / page, root / page)
            release = {
                "draft": False, "prerelease": False, "tag_name": "v.1.28.3", "name": "VonCMS v1.28.3",
                "html_url": "https://github.com/Vondereich/VonCMS/releases/tag/v.1.28.3",
                "published_at": "2026-11-14T10:04:49Z", "updated_at": "2026-11-15T09:00:00Z",
                "body": "A publishing release with personal AI keys and targeted corrections.", "assets": [],
            }
            loader = ('globalThis.fetch = async () => ({ok: true, json: async () => '
                      + json.dumps([release]) + '}); await import(' + json.dumps(script.as_uri()) + ');')
            synced = subprocess.run(["node", "--input-type=module", "-e", loader], capture_output=True, text=True, timeout=15)
            self.assertEqual(synced.returncode, 0, synced.stderr)
            self.assertIn("generated static release fallback for v1.28.3", synced.stdout)
            page = (root / "whats-new.html").read_text(encoding="utf-8")
            self.assertIn('"dateModified": "2026-11-15T09:00:00.000Z"', page)
            self.assertIn('"softwareVersion": "1.28.3"', (root / "index.html").read_text(encoding="utf-8"))
            failed_loader = ('globalThis.fetch = async () => { throw new Error("offline fixture"); }; await import('
                             + json.dumps(script.as_uri()) + ');')
            failed = subprocess.run(["node", "--input-type=module", "-e", failed_loader], capture_output=True, text=True, timeout=15)
            self.assertEqual(failed.returncode, 0, failed.stderr)
            self.assertIn("keeping checked-in release fallback", failed.stderr)
            self.assertEqual((root / "whats-new.html").read_text(encoding="utf-8"), page)


if __name__ == "__main__":
    unittest.main()
