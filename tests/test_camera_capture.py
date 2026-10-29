import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import httpx
from backend.camera_gateway import load_config, record_rtsp, send_job


class CameraCaptureTests(unittest.TestCase):
    def setUp(self):
        self.cache = Path(__file__).resolve().parents[1] / ".cache" / "gateway-tests"
        self.cache.mkdir(parents=True, exist_ok=True)

    def test_configuration_validates_coordinates_and_keeps_password_out_of_json(self):
        with tempfile.TemporaryDirectory(dir=self.cache) as folder:
            path = Path(folder) / "config.json"
            data = {"web_url": "https://demo.test", "consent": True, "cameras": [
                {"name": "Gate", "rtsp_url_env": "GATE_RTSP"}, {"name": "Yard", "rtsp_url_env": "YARD_RTSP"}]}
            path.write_text(json.dumps(data))
            with patch.dict(os.environ, {"GATE_RTSP": "rtsp://user:private@192.168.1.1/live", "YARD_RTSP": "rtsp://192.168.1.2/live"}):
                config = load_config(path)
                self.assertNotIn("private", json.dumps(config))
                self.assertNotIn("timeline_start_seconds", config["cameras"][0])
                data["cameras"][0]["location"] = {"lat": 91, "lng": 0}
                path.write_text(json.dumps(data))
                with self.assertRaisesRegex(ValueError, "coordinates"):
                    load_config(path)

    def test_failed_upload_preserves_access_before_network_failure(self):
        requests = []
        def mock(request):
            requests.append(request)
            if request.url.path == "/api/demo/jobs":
                return httpx.Response(200, json={"id": "00000000-0000-4000-8000-000000000001", "token": "a" * 43,
                    "uploads": [{"url": "https://storage.test/signed?secret=hidden"}]})
            return httpx.Response(503)
        with tempfile.TemporaryDirectory(dir=self.cache) as folder:
            output = Path(folder)
            video = output / "CAM-1.mp4"
            video.write_bytes(b"video")
            with httpx.Client(transport=httpx.MockTransport(mock)) as client:
                with self.assertRaisesRegex(RuntimeError, "preserved"):
                    send_job(client, "https://demo.test", [{"path": str(video), "metadata": {"name": "CAM-1.mp4", "size": 5}}], output)
            receipt = json.loads((output / "access.json").read_text())
            self.assertEqual(receipt["kind"], "outlier-camera-job")
            self.assertNotIn("hidden", (output / "access.json").read_text())
            self.assertEqual(len(requests), 2)

    def test_successful_submission_streams_bytes_and_authenticates_finalization(self):
        def mock(request):
            if request.url.path == "/api/demo/jobs":
                return httpx.Response(200, json={"id": "00000000-0000-4000-8000-000000000001", "token": "a" * 43,
                    "uploads": [{"url": "https://storage.test/upload"}]})
            if request.method == "PUT":
                self.assertEqual(request.read(), b"video")
            else:
                self.assertEqual(request.headers["Authorization"], "Bearer " + "a" * 43)
            return httpx.Response(200, json={"status": "queued"})
        with tempfile.TemporaryDirectory(dir=self.cache) as folder:
            output = Path(folder); video = output / "CAM-1.mp4"; video.write_bytes(b"video")
            with httpx.Client(transport=httpx.MockTransport(mock)) as client:
                send_job(client, "https://demo.test", [{"path": str(video), "metadata": {}}], output)
            self.assertEqual(json.loads((output / "state.json").read_text())["stage"], "queued")

    def test_recorder_preserves_low_fps_clip_duration(self):
        import av
        import numpy as np
        from backend.multicam.video_io import H264Writer
        with tempfile.TemporaryDirectory(dir=self.cache) as folder:
            source, target = Path(folder) / "source.mp4", Path(folder) / "capture.mp4"
            writer = H264Writer(source, 4, 160, 90)
            try:
                for _ in range(8):
                    writer.write(np.zeros((90, 160, 3), dtype=np.uint8))
            finally:
                writer.close()
            # Exercise the actual decoder/encoder without requiring a LAN camera in CI.
            with patch.dict(os.environ, {"OUTLIER_CAPTURE_URL": str(source)}):
                record_rtsp(target, 2)
            with av.open(str(target)) as clip:
                self.assertEqual(float(clip.streams.video[0].average_rate), 4)
                self.assertEqual(len(list(clip.decode(video=0))), 8)

if __name__ == "__main__":
    unittest.main()
