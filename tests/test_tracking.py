import unittest

from backend.ai.tracking import assign_tracks, iou


class TrackingTests(unittest.TestCase):
    def test_iou(self):
        self.assertEqual(iou([0, 0, 10, 10], [20, 20, 30, 30]), 0)
        self.assertAlmostEqual(iou([0, 0, 10, 10], [5, 5, 15, 15]), 25 / 175)

    def test_stable_ids_for_nearby_boxes(self):
        frames = [
            {"frame_index": 0, "time_seconds": 0, "detections": [{"score": 0.8, "xyxy": [0, 0, 100, 100]}]},
            {"frame_index": 1, "time_seconds": 0.5, "detections": [{"score": 0.9, "xyxy": [5, 0, 105, 100]}]},
        ]
        tracks = assign_tracks(frames)
        self.assertEqual(len(tracks), 1)
        self.assertEqual([f["detections"][0]["track_id"] for f in frames], [1, 1])
        self.assertEqual(tracks[0]["best_frame"], 1)

    def test_gap_starts_new_track(self):
        frames = [
            {"frame_index": 0, "time_seconds": 0, "detections": [{"score": 0.8, "xyxy": [0, 0, 100, 100]}]},
            {"frame_index": 40, "time_seconds": 2, "detections": [{"score": 0.8, "xyxy": [0, 0, 100, 100]}]},
        ]
        self.assertEqual(len(assign_tracks(frames)), 2)


if __name__ == "__main__":
    unittest.main()
