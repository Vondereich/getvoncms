"""Regression checks for the static Pages builder; no third-party packages needed."""
from pathlib import Path
import tempfile
import unittest

from build_site import ASSETS, PAGES, build, inline_stylesheets


class BuildSiteTests(unittest.TestCase):
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
            (self.root / name).write_text('<link rel="stylesheet" href="css/test.css"><body>Publication</body>')
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
        with self.assertRaises(ValueError):
            build(self.root, output)

    def test_cannot_overwrite_source_or_assets(self):
        for output in (self.root, self.root.parent, self.root / "css/output", self.root / "upload/output"):
            with self.subTest(output=output), self.assertRaises(ValueError):
                build(self.root, output)


if __name__ == "__main__":
    unittest.main()
