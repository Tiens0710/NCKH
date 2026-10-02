import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
import torch
from backend.ai.rfdetr_detector import RFDETRAdapter
from backend.ai.retinanet import detect_video, DetectionOptions
from test_retinanet_batching import FakeCapture


class FakeRF:
    def predict(self, image, threshold):
        assert image.mode == 'RGB'
        return type('Detections', (), dict(class_id=np.array([0, 1]),
                    confidence=np.array([.9, .8]),
                    xyxy=np.array([[10, 10, 40, 80], [50, 10, 90, 80]])))()


class RFTests(unittest.TestCase):
    def test_shared_schema_and_person_mapping(self):
        adapter = RFDETRAdapter(FakeRF(), torch.device('cpu'), {0:'person', 1:'bicycle'}, 'test')
        with patch('cv2.VideoCapture', return_value=FakeCapture(2)):
            result = detect_video(Path('fake.mp4'), DetectionOptions(sample_seconds=.1),
                                  (adapter, lambda image:image, 1, torch))
        self.assertEqual(result['model'], 'rf_detr_medium')
        self.assertEqual(result['person_boxes'], 2)
        self.assertEqual(result['inference_batch_size'], 1)
        self.assertIn('clothing_colors', result['frames'][0]['detections'][0])


if __name__ == '__main__':
    unittest.main()
