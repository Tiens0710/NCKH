"""RF-DETR Medium adapter for the shared video/tracking result schema."""
from importlib.metadata import version


class RFDETRAdapter:
    model_name = "rf_detr_medium"

    def __init__(self, model, device, classes, package_version):
        self.model = model
        self.device = device
        self.classes = classes
        self.weights_version = "COCO_pretrained;rfdetr=" + package_version

    def predict_images(self, images, threshold):
        import numpy as np
        predictions = []
        # Serial native API: predictable memory usage, no fictitious batching.
        for image in images:
            detection = self.model.predict(image, threshold=threshold)
            labels = np.array([
                1 if self.classes[int(label)] == "person" else -1
                for label in detection.class_id
            ], dtype=np.int64)
            predictions.append({"labels": labels, "scores": detection.confidence,
                                "boxes": detection.xyxy})
        return predictions


def load_detector(device="auto"):
    import torch
    from rfdetr import RFDETRMedium
    from rfdetr.assets.coco_classes import COCO_CLASSES
    if device not in {"auto", "cpu", "cuda"}:
        raise ValueError("device must be auto, cpu or cuda")
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but unavailable")
    model = RFDETRMedium(device=device)
    adapter = RFDETRAdapter(model, torch.device(device), COCO_CLASSES, version("rfdetr"))
    return adapter, lambda image: image, 1, torch
