import unittest

import numpy as np

from backend.ai.clothing_colors import estimate_clothing_colors


class ClothingColorTests(unittest.TestCase):
    def test_dark_color_cast_is_not_reported_as_bright_blue(self):
        frame = np.full((100, 100, 3), (65, 47, 47), dtype=np.uint8)
        colors = estimate_clothing_colors(frame, [0, 0, 100, 100])
        self.assertEqual(colors["upper"]["name"], "black")

    def test_torso_and_legs_ignore_head_and_background(self):
        frame = np.full((100, 100, 3), (0, 255, 0), dtype=np.uint8)
        frame[23:52, 25:75] = (255, 0, 0)
        frame[56:85, 25:75] = (0, 0, 0)
        colors = estimate_clothing_colors(frame, [0, 0, 100, 100])
        self.assertEqual(colors["upper"]["name"], "blue")
        self.assertEqual(colors["lower"]["name"], "black")

    def test_invalid_and_small_boxes_are_unknown(self):
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        for box in ([1, 1, 4, 8], [80, 80, 10, 10], [-90, -90, -20, -20], [0, 0, float("nan"), 20]):
            colors = estimate_clothing_colors(frame, box)
            self.assertEqual(colors["upper"]["name"], "unknown")
            self.assertEqual(colors["lower"]["name"], "unknown")

    def test_clipping_never_wraps_negative_coordinates(self):
        frame = np.full((100, 100, 3), 255, dtype=np.uint8)
        colors = estimate_clothing_colors(frame, [-10, -10, 100, 100])
        self.assertEqual(colors["upper"]["name"], "white")


if __name__ == "__main__":
    unittest.main()
