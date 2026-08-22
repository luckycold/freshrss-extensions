import html
import json
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / "static" / "oled-black.css"
PHP = ROOT / "extension.php"
META = ROOT / "metadata.json"
FIXTURE = Path(__file__).with_name("fixture.html")
BLACK = "rgb(0, 0, 0)"


class OledBlackOverlayTests(unittest.TestCase):
    _computed_cache = {}

    def computed_values(self, width=1280, height=720, rtl=False):
        viewport = (width, height, rtl)
        if viewport in self.__class__._computed_cache:
            return self.__class__._computed_cache[viewport]
        fixture_url = FIXTURE.as_uri() + ("?rtl=1" if rtl else "")
        last_error = ""
        for _attempt in range(3):
            with tempfile.TemporaryDirectory(prefix="oled-overlay-chromium-") as profile:
                result = subprocess.run(
                    [
                        "chromium",
                        "--headless",
                        "--no-sandbox",
                        "--disable-gpu",
                        "--allow-file-access-from-files",
                        f"--user-data-dir={profile}",
                        f"--window-size={width},{height}",
                        "--virtual-time-budget=2000",
                        "--dump-dom",
                        fixture_url,
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                    timeout=45,
                )
            match = re.search(r'<pre id="computed-results">(.*?)</pre>', result.stdout, re.S)
            if match is None:
                last_error = result.stderr[-1000:]
                continue
            values = json.loads(html.unescape(match.group(1)))
            if values.get("card") == BLACK and values.get("header") == BLACK:
                self.__class__._computed_cache[viewport] = values
                return values
            last_error = f"unstyled dump: card={values.get('card')} header={values.get('header')}"
        self.fail(f"could not measure styled fixture: {last_error}")

    def test_extension_contract(self):
        metadata = json.loads(META.read_text(encoding="utf-8"))
        self.assertEqual(metadata["name"], "OLED Black Overlay")
        self.assertEqual(metadata["entrypoint"], "OledBlackOverlay")
        self.assertEqual(metadata["type"], "user")
        self.assertEqual(metadata["version"], "1.0.0")
        self.assertNotIn(":not(.current)", CSS.read_text(encoding="utf-8"))
        php = PHP.read_text(encoding="utf-8")
        self.assertIn("Minz_View::appendStyle($this->getFileUrl('oled-black.css'))", php)

    def test_css_contract_covers_oled_surfaces(self):
        css = CSS.read_text(encoding="utf-8")
        required = [
            "--yl-color-body-background: #000",
            "--cmc-card-background: #000",
            "html,\nbody",
            "#yl_category_toolbar",
            "div.flux.cmc-no-thumbnail",
            ".cmc-text-content",
            "#youlagTheaterModal",
            "#ylArticleSplitPane",
            "#global #overlay #panel",
        ]
        for token in required:
            self.assertIn(token, css)
        self.assertNotIn("--yl-color-gradient-active: #000", css)
        self.assertNotIn("--cmc-left-action-color: #000", css)
        self.assertNotIn("--cmc-right-action-color: #000", css)

    def test_controls_and_unread_counts_share_the_configure_view_surface(self):
        values = self.computed_values()
        reference = values["configureView"]
        self.assertEqual(reference["backgroundColor"], "rgba(255, 255, 255, 0.04)")
        self.assertEqual(reference["borderRadius"], "999px")
        self.assertGreaterEqual(values["globalSettingsRect"]["width"], 40)
        self.assertGreaterEqual(values["globalSettingsRect"]["height"], 40)
        for name in ["globalSettings", "defaultFilter", "markRead", "markReadMore", "moreSettings", "userQueries", "sortOrder"]:
            control = values[name]
            self.assertEqual(control["backgroundColor"], reference["backgroundColor"], name)
            self.assertEqual(control["borderColor"], reference["borderColor"], name)
            self.assertEqual(control["color"], reference["color"], name)
            self.assertEqual(control["boxShadow"], "none", name)
        for name in ["globalSettings", "defaultFilter", "moreSettings", "userQueries", "sortOrder"]:
            self.assertEqual(values[name]["borderRadius"], reference["borderRadius"], name)
        subscription = values["subscriptionCount"]
        for key in ["backgroundColor", "borderColor", "borderRadius", "color", "boxShadow"]:
            self.assertEqual(subscription[key], reference[key], f"subscriptionCount {key}")
        self.assertEqual(subscription["backgroundImage"], "none")
        self.assertNotEqual(values["activeFilter"]["backgroundImage"], reference["backgroundImage"])
        self.assertGreaterEqual(float(values["actionGroup"]["gap"].removesuffix("px")), 4.0)

        for name in ["globalSettingsIcon", "userQueriesIcon", "markReadIcon", "sortIcon"]:
            icon = values[name]
            self.assertNotEqual(icon["display"], "none", name)
            self.assertEqual(icon["visibility"], "visible", name)
            self.assertEqual(icon["opacity"], "1", name)
            self.assertGreaterEqual(icon["width"], 15, name)
            self.assertGreaterEqual(icon["height"], 15, name)
            self.assertEqual(icon["naturalWidth"], 16, name)
            self.assertEqual(icon["naturalHeight"], 16, name)
        self.assertEqual(values["markReadGroup"]["gap"], "0px")
        self.assertEqual(values["markRead"]["borderRadius"], "999px 0px 0px 999px")
        self.assertEqual(values["markReadMore"]["borderRadius"], "0px 999px 999px 0px")
        self.assertEqual(values["markRead"]["borderRightWidth"], "0px")
        self.assertEqual(values["markReadMore"]["borderLeftWidth"], "1px")

    def test_computed_major_surfaces_are_true_black(self):
        values = self.computed_values()
        for surface in [
            "html",
            "body",
            "header",
            "aside",
            "stream",
            "toolbar",
            "card",
            "cardHeader",
            "thumbnail",
            "textCard",
            "panel",
            "settingsBox",
            "settingsInput",
        ]:
            self.assertEqual(values[surface], BLACK, f"{surface}: {values[surface]}")
        self.assertNotEqual(values["swipeAccent"], "none")
        self.assertNotIn("rgb(0, 0, 0)", values["swipeAccent"])

    def test_mobile_search_matches_global_settings_without_losing_its_icon(self):
        values = self.computed_values(width=390, height=844)
        desktop = self.computed_values()
        reference = values["globalSettings"]
        search = values["mobileSearch"]
        self.assertEqual(desktop["mobileSearchRect"]["width"], 0)
        self.assertEqual(desktop["mobileSearchRect"]["height"], 0)
        self.assertEqual(search["backgroundColor"], reference["backgroundColor"])
        self.assertEqual(search["borderColor"], reference["borderColor"])
        self.assertEqual(search["borderRadius"], reference["borderRadius"])
        self.assertEqual(search["color"], reference["color"])
        self.assertEqual(search["boxShadow"], "none")
        self.assertGreaterEqual(values["mobileSearchRect"]["width"], 40)
        self.assertGreaterEqual(values["mobileSearchRect"]["height"], 40)
        icon = values["mobileSearchIcon"]
        self.assertNotEqual(icon["display"], "none")
        self.assertEqual(icon["visibility"], "visible")
        self.assertEqual(icon["opacity"], "1")
        self.assertGreaterEqual(icon["width"], 14)
        self.assertGreaterEqual(icon["height"], 14)
        self.assertEqual(icon["naturalWidth"], 16)
        self.assertEqual(icon["naturalHeight"], 16)

    def test_mark_read_split_pill_matches_the_adjacent_control_height(self):
        values = self.computed_values()
        reference = values["defaultFilterRect"]
        group = values["markReadGroupRect"]
        primary = values["markReadRect"]
        dropdown = values["markReadMoreRect"]
        self.assertAlmostEqual(group["height"], reference["height"], delta=0.5)
        self.assertAlmostEqual(primary["height"], reference["height"], delta=0.5)
        self.assertAlmostEqual(dropdown["height"], reference["height"], delta=0.5)
        self.assertAlmostEqual(primary["top"], dropdown["top"], delta=0.5)
        self.assertAlmostEqual(primary["bottom"], dropdown["bottom"], delta=0.5)

    def test_mobile_mark_read_dropdown_becomes_a_full_sized_round_control(self):
        values = self.computed_values(width=390, height=844)
        reference = values["defaultFilterRect"]
        group = values["markReadGroupRect"]
        dropdown = values["markReadMoreRect"]
        self.assertEqual(values["markReadRect"]["width"], 0)
        self.assertEqual(values["markReadRect"]["height"], 0)
        self.assertAlmostEqual(group["height"], reference["height"], delta=0.5)
        self.assertAlmostEqual(dropdown["height"], reference["height"], delta=0.5)
        self.assertAlmostEqual(dropdown["width"], reference["width"], delta=0.5)
        self.assertEqual(values["markReadMore"]["borderRadius"], "999px")
        self.assertEqual(values["markReadMoreBefore"]["content"], "none")
        icon = values["markReadIcon"]
        self.assertNotEqual(icon["display"], "none")
        self.assertEqual(icon["visibility"], "visible")
        self.assertGreater(icon["width"], 0)
        self.assertGreater(icon["height"], 0)

    def test_rtl_mark_read_split_pill_reverses_its_exterior_corners(self):
        values = self.computed_values(rtl=True)
        primary = values["markRead"]
        dropdown = values["markReadMore"]
        self.assertEqual(primary["borderRadius"], "0px 999px 999px 0px")
        self.assertEqual(primary["borderLeftWidth"], "0px")
        self.assertEqual(primary["borderRightWidth"], "1px")
        self.assertEqual(dropdown["borderRadius"], "999px 0px 0px 999px")
        self.assertEqual(dropdown["borderLeftWidth"], "1px")
        self.assertEqual(dropdown["borderRightWidth"], "1px")
        self.assertAlmostEqual(
            values["markReadRect"]["height"],
            values["markReadMoreRect"]["height"],
            delta=0.5,
        )

    def test_desktop_search_and_magnifier_form_one_completed_pill(self):
        values = self.computed_values()
        reference = values["configureView"]
        group = values["headerSearch"]
        field = values["headerSearchInput"]
        button = values["headerSearchButton"]
        field_box = values["headerSearchInputRect"]
        button_box = values["headerSearchButtonRect"]
        icon = values["headerSearchIcon"]
        self.assertEqual(group["gap"], "0px")
        self.assertEqual(field["backgroundColor"], reference["backgroundColor"])
        self.assertEqual(button["backgroundColor"], reference["backgroundColor"])
        self.assertEqual(field["borderColor"], reference["borderColor"])
        self.assertEqual(button["borderColor"], reference["borderColor"])
        self.assertEqual(field["borderRadius"], "999px 0px 0px 999px")
        self.assertEqual(button["borderRadius"], "0px 999px 999px 0px")
        self.assertEqual(field["borderRightWidth"], "0px")
        self.assertEqual(button["borderLeftWidth"], "0px")
        self.assertEqual(field["borderTopWidth"], "1px")
        self.assertEqual(field["borderBottomWidth"], "1px")
        self.assertEqual(field["borderLeftWidth"], "1px")
        self.assertEqual(button["borderTopWidth"], "1px")
        self.assertEqual(button["borderRightWidth"], "1px")
        self.assertEqual(button["borderBottomWidth"], "1px")
        self.assertEqual(button["boxShadow"], "none")
        self.assertAlmostEqual(field_box["height"], button_box["height"], delta=0.5)
        self.assertAlmostEqual(field_box["top"], button_box["top"], delta=0.5)
        self.assertAlmostEqual(field_box["bottom"], button_box["bottom"], delta=0.5)
        self.assertAlmostEqual(field_box["right"], button_box["left"], delta=0.5)
        self.assertGreaterEqual(button_box["width"], 40)
        self.assertGreaterEqual(button_box["height"], 38)
        self.assertNotEqual(icon["display"], "none")
        self.assertEqual(icon["visibility"], "visible")
        self.assertGreater(icon["width"], 0)
        self.assertGreater(icon["height"], 0)

    def test_rtl_desktop_search_pill_reverses_its_exterior_corners(self):
        values = self.computed_values(rtl=True)
        field = values["headerSearchInput"]
        button = values["headerSearchButton"]
        self.assertEqual(field["borderRadius"], "0px 999px 999px 0px")
        self.assertEqual(field["borderLeftWidth"], "0px")
        self.assertEqual(field["borderRightWidth"], "1px")
        self.assertEqual(button["borderRadius"], "999px 0px 0px 999px")
        self.assertEqual(button["borderRightWidth"], "0px")
        self.assertEqual(button["borderLeftWidth"], "1px")
        self.assertAlmostEqual(
            values["headerSearchInputRect"]["height"],
            values["headerSearchButtonRect"]["height"],
            delta=0.5,
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
