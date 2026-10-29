import type { PublicDemoResult } from './public-demo';
type Box = [number, number, number, number];
export type DetectionEvaluation = {
  dataset: string; labeledFrames: number; positiveFrames: number; negativeFrames: number;
  tp: number; fp: number; fn: number; precision: number | null; recall: number | null; f1: number | null;
  frameAccuracy: number; iouThreshold: number; evaluatedFrames: { camera_id: string; frame_index: number }[];
};
function isBox(value: unknown): value is Box {
  return Array.isArray(value) && value.length === 4 && value.every(Number.isFinite) && value[2] > value[0] && value[3] > value[1];
}
function iou(a: Box, b: Box) {
  const intersection = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  return intersection / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - intersection);
}
/** Only explicitly labelled frames are evaluated. Missing labels are never treated as negatives.
 * Matching: stored predictions in descending confidence, one unmatched GT box per prediction.
 */
export function evaluateDetections(result: PublicDemoResult, value: unknown, expectedSourceId?: string): DetectionEvaluation {
  if (!value || typeof value !== 'object' || !('frames' in value) || !Array.isArray(value.frames) || !value.frames.length || value.frames.length > 10000)
    throw new Error('File nhãn phải có frames gồm 1–10.000 frame đã gán nhãn.');
  if (expectedSourceId && (!('source_id' in value) || value.source_id !== expectedSourceId))
    throw new Error('source_id của file nhãn không khớp phiên đang mở. Tải cấu trúc nhãn của đúng phiên này.');
  const seen = new Set<string>();
  let tp = 0, fp = 0, fn = 0, correctPresence = 0, positiveFrames = 0;
  const evaluatedFrames: DetectionEvaluation['evaluatedFrames'] = [];
  for (const row of value.frames) {
    if (!row || typeof row.camera_id !== 'string' || !Number.isInteger(row.frame_index) || !Array.isArray(row.boxes) || row.boxes.length > 1000 || !row.boxes.every(isBox))
      throw new Error('Mỗi frame cần camera_id, frame_index và boxes hợp lệ. boxes: [] nghĩa là đã kiểm tra không có người; boxes: null chưa phải nhãn.');
    const key = `${row.camera_id}:${row.frame_index}`;
    if (seen.has(key)) throw new Error(`Frame bị lặp trong file nhãn: ${key}.`);
    seen.add(key);
    const frame = result.cameras.find(camera => camera.camera_id === row.camera_id)?.frames.find(frame => frame.frame_index === row.frame_index);
    if (!frame) throw new Error(`Không có dự đoán đã lưu cho frame ${key}. Chọn nhãn của đúng phiên đang mở.`);
    const truth = row.boxes as Box[];
    const predicted = frame.detections.filter(item => isBox(item.xyxy) && Number.isFinite(item.score)).toSorted((a, b) => b.score - a.score);
    if (truth.length) positiveFrames++;
    if (!!truth.length === !!predicted.length) correctPresence++;
    const matched = new Set<number>();
    for (const prediction of predicted) {
      let best = -1, overlap = .5;
      truth.forEach((box, index) => { const score = iou(prediction.xyxy as Box, box); if (!matched.has(index) && score >= overlap) { best = index; overlap = score; } });
      if (best >= 0) { tp++; matched.add(best); } else fp++;
    }
    fn += truth.length - matched.size;
    evaluatedFrames.push({ camera_id: row.camera_id, frame_index: row.frame_index });
  }
  return { dataset: 'dataset_name' in value && typeof value.dataset_name === 'string' ? value.dataset_name.slice(0, 120) : 'Nhãn do người dùng cung cấp',
    labeledFrames: seen.size, positiveFrames, negativeFrames: seen.size - positiveFrames, tp, fp, fn,
    precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null,
    f1: 2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : null, frameAccuracy: correctPresence / seen.size, iouThreshold: .5, evaluatedFrames };
}
