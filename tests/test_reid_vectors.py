import math
import unittest
from pathlib import Path

from backend.ai.reid import embed_images


class FakeTensor:
    def __init__(self, rows):
        self.rows = rows

    def detach(self):
        return self

    def cpu(self):
        return self

    def tolist(self):
        return self.rows


class ReidVectorTests(unittest.TestCase):
    def test_normalization(self):
        vectors = embed_images(lambda _: FakeTensor([[2.0] + [0.0] * 511]), [Path("person.jpg")])
        self.assertEqual(len(vectors[0]), 512)
        self.assertEqual(vectors[0][0], 1.0)

    def test_bad_vector_rejected(self):
        with self.assertRaises(ValueError):
            embed_images(lambda _: FakeTensor([[math.nan] + [0.0] * 511]), [Path("bad.jpg")])


if __name__ == "__main__":
    unittest.main()
