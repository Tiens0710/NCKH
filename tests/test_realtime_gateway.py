import time
import unittest
import asyncio
import httpx
import numpy as np
from backend.realtime_gateway import Engine, create_app


class DetectorDouble:
    metadata = {"name": "test-double", "device": "cpu"}
    def predict(self, image, threshold):
        return [{"xyxy": [2, 3, 50, 70], "score": .9}]


class RealtimeGatewayTests(unittest.TestCase):
    def engine(self):
        return Engine({"cameras": [{"id": "gate", "video_path": "test.mp4"}]}, DetectorDouble())

    def test_latest_frame_replaces_backlog_and_results_match_processed_frame(self):
        engine = self.engine(); camera = engine.cameras['gate']
        for i in range(20):
            camera.offer(np.full((90, 160, 3), i, dtype=np.uint8))
        self.assertTrue(engine.detect_latest(camera))
        result = engine.snapshot('gate')
        self.assertEqual(result['frame']['sequence'], 20)
        self.assertEqual(result['frame']['width'], 160)
        self.assertEqual(result['frame']['detections'][0]['xyxy'], [2, 3, 50, 70])
        self.assertTrue(result['frame']['jpeg'].startswith('/9j/'))
        self.assertTrue(result['simulation'])
        self.assertFalse(engine.detect_latest(camera))
        camera.offer(np.zeros((90, 160, 3), dtype=np.uint8))
        self.assertEqual(engine.snapshot('gate')['frame']['sequence'], 20)

    def test_stale_frames_and_failed_camera_are_not_shown_as_current(self):
        engine = self.engine(); camera = engine.cameras['gate']
        camera.offer(np.zeros((90, 160, 3), dtype=np.uint8))
        camera.frame.received_tick = time.monotonic() - 4
        self.assertFalse(engine.detect_latest(camera))
        camera.offer(np.zeros((90, 160, 3), dtype=np.uint8)); engine.detect_latest(camera)
        camera.result['received_tick'] = time.monotonic() - 4
        self.assertEqual(engine.snapshot('gate')['status'], 'stale')
        self.assertIsNone(engine.snapshot('gate')['frame'])

    def test_http_reads_require_gateway_token_and_reject_wrong_origin(self):
        engine = self.engine(); engine.start = lambda: None
        camera = engine.cameras['gate']; camera.offer(np.zeros((90,160,3),dtype=np.uint8)); engine.detect_latest(camera)
        async def run():
            transport = httpx.ASGITransport(app=create_app(engine, 'a'*43, ['https://campus.example']))
            async with httpx.AsyncClient(transport=transport, base_url='https://gateway.test') as client:
                self.assertEqual((await client.get('/cameras/gate/latest')).status_code, 401)
                self.assertEqual((await client.get('/cameras/other/latest', headers={'Authorization':'Bearer '+'a'*43})).status_code,404)
                response = await client.get('/cameras/gate/latest', headers={'Authorization':'Bearer '+'a'*43, 'Origin':'https://campus.example'})
                self.assertEqual(response.status_code,200)
                self.assertEqual(response.headers['cache-control'],'no-store')
                self.assertEqual(response.headers['access-control-allow-origin'],'https://campus.example')
                self.assertNotIn('a'*43,response.text)
                rejected = await client.options('/cameras/gate/latest',headers={'Origin':'https://wrong.example','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'Authorization'})
                self.assertEqual(rejected.status_code,400)
        asyncio.run(run())


if __name__ == '__main__':
    unittest.main()
