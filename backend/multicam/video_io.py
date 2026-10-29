from fractions import Fraction
from pathlib import Path

import numpy as np


class H264Writer:
    """Browser-compatible video; encoding never modifies inference coordinates."""
    def __init__(self, path: Path, fps: float, width: int, height: int):
        import av

        self.av = av
        self.container = av.open(str(path), mode="w")
        self.stream = self.container.add_stream("libx264", rate=Fraction(fps).limit_denominator(1000))
        self.stream.width, self.stream.height = width, height
        self.stream.pix_fmt = "yuv420p" if width % 2 == 0 and height % 2 == 0 else "yuv444p"
        self.stream.options = {"crf": "22", "preset": "fast"}

    def write(self, image: np.ndarray) -> None:
        frame = self.av.VideoFrame.from_ndarray(image, format="bgr24")
        for packet in self.stream.encode(frame):
            self.container.mux(packet)

    def close(self) -> None:
        try:
            for packet in self.stream.encode():
                self.container.mux(packet)
        finally:
            self.container.close()
