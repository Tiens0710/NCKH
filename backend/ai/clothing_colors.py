"""Estimate clothing colours from central body regions of a detected person.

This is an image heuristic, not a clothing segmentation model. Dominant fraction
describes pixel agreement and must not be interpreted as model confidence.
"""

from __future__ import annotations

import math

import cv2
import numpy as np


COLOR_LABELS = {
    "black": "đen/tối", "white": "trắng", "gray": "xám", "red": "đỏ",
    "orange": "cam", "brown": "nâu", "yellow": "vàng", "green": "xanh lá",
    "blue": "xanh dương", "purple": "tím", "pink": "hồng",
    "unknown": "chưa rõ",
}


def dominant_color(region: np.ndarray) -> dict:
    unknown = {"name": "unknown", "label": COLOR_LABELS["unknown"], "dominant_fraction": 0.0}
    if region.size == 0 or min(region.shape[:2]) < 4:
        return unknown
    hsv = cv2.cvtColor(cv2.resize(region, (32, 32), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    names = np.full(h.shape, "unknown", dtype="<U7")
    # Hue is unstable on dark clothing, especially with tinted indoor lighting.
    names[v < 75] = "black"
    neutral = (s < 45) & (v >= 75)
    names[neutral & (v >= 205)] = "white"
    names[neutral & (v < 205)] = "gray"
    chromatic = (s >= 45) & (v >= 75)
    for name, mask in (
        ("red", (h < 10) | (h >= 170)),
        ("orange", (h >= 10) & (h < 23)),
        ("yellow", (h >= 23) & (h < 35)),
        ("green", (h >= 35) & (h < 85)),
        ("blue", (h >= 85) & (h < 130)),
        ("purple", (h >= 130) & (h < 155)),
        ("pink", (h >= 155) & (h < 170)),
    ):
        names[chromatic & mask] = name
    names[chromatic & (h >= 5) & (h < 30) & (v < 150)] = "brown"
    values, counts = np.unique(names, return_counts=True)
    winner = int(counts.argmax())
    fraction = float(counts[winner] / names.size)
    name = str(values[winner]) if fraction >= 0.35 else "unknown"
    return {"name": name, "label": COLOR_LABELS[name], "dominant_fraction": round(fraction, 3)}


def estimate_clothing_colors(frame: np.ndarray, xyxy: list[float]) -> dict:
    """Use box-relative torso/leg regions, avoiding head, edges and feet."""
    result = {"method": "central_body_hsv_v1", "approximate": True}
    empty = frame[:0, :0]
    if len(xyxy) != 4 or not all(math.isfinite(float(c)) for c in xyxy):
        return {**result, "upper": dominant_color(empty), "lower": dominant_color(empty)}
    x1, y1, x2, y2 = map(float, xyxy)
    width, height = x2 - x1, y2 - y1
    for key, start, end in (("upper", 0.23, 0.52), ("lower", 0.56, 0.85)):
        left = max(0, min(frame.shape[1], math.floor(x1 + width * 0.25)))
        right = max(0, min(frame.shape[1], math.ceil(x1 + width * 0.75)))
        top = max(0, min(frame.shape[0], math.floor(y1 + height * start)))
        bottom = max(0, min(frame.shape[0], math.ceil(y1 + height * end)))
        region = frame[top:bottom, left:right] if width >= 12 and height >= 32 and right > left and bottom > top else empty
        result[key] = dominant_color(region)
    return result
