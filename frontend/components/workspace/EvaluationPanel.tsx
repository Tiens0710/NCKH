"use client";
import { useState } from 'react';
import { Download, FileCheck2 } from 'lucide-react';
import type { PublicDemoResult } from '@/lib/public-demo';
import { evaluateDetections, type DetectionEvaluation } from '@/lib/detection-evaluation';
import { downloadJson } from './WorkspaceProvider';
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
export function EvaluationPanel({ result, sourceId }: { result: PublicDemoResult; sourceId: string }) {
  const [report, setReport] = useState<DetectionEvaluation | null>(null);
  const [error, setError] = useState('');
  async function load(file?: File) {
    if (!file) return;
    setError(''); setReport(null);
    try { if (file.size > 2 * 1024 * 1024) throw new Error('File nhãn tối đa 2 MB.'); setReport(evaluateDetections(result, JSON.parse(await file.text()), sourceId)); }
    catch (failure) { setError(failure instanceof SyntaxError ? 'File không phải JSON hợp lệ.' : (failure as Error).message); }
  }
  return <details className="ct-evaluation"><summary><FileCheck2 size={16} />Đánh giá bằng dữ liệu gán nhãn<span>{report ? `${report.labeledFrames} frame đã đối chiếu` : 'Chưa có số đo độ chính xác'}</span></summary>
    <div className="ct-evaluation-content"><p>Đánh giá phát hiện người trên các frame có nhãn, IoU ≥ 0,5. Đây không phải độ chính xác nhận diện cùng một người giữa camera.</p>
      <p className="ct-evaluation-source">Mô hình phiên đã lưu: {result.detector.name} · {result.detector.device}. Tốc độ đã ghi nhận: {Number.isFinite(result.metrics.processing_fps) && result.metrics.processing_fps > 0 ? `${result.metrics.processing_fps.toFixed(1)} FPS toàn luồng` : 'chưa có số đo tốc độ'}{Number.isFinite(result.metrics.inference_fps) && result.metrics.inference_fps > 0 ? ` · ${result.metrics.inference_fps.toFixed(1)} FPS suy luận` : ''}. Không phải lần đo mới trên trình duyệt.</p>
      <div className="ct-evaluation-actions"><label className="ct-file-control">Nạp nhãn JSON<input type="file" accept="application/json,.json" onChange={event => { void load(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
        <button onClick={() => downloadJson({ source_id: sourceId, dataset_name: '', coordinate_system: 'xyxy pixels of original frame', instructions: 'Gán nhãn độc lập. Thay boxes:null bằng các khung người thật; [] chỉ dùng cho frame đã kiểm tra không có người. Không chép dự đoán thành nhãn.', frames: result.cameras.flatMap(camera => camera.frames.slice(0, 2).map(frame => ({ camera_id: camera.camera_id, frame_index: frame.frame_index, time_seconds: frame.time_seconds, boxes: null }))) }, 'ground-truth-template.json')}>Tải cấu trúc file nhãn</button>
        {report ? <button onClick={() => downloadJson({ source_id: sourceId, detector: result.detector, evaluation: report, processing_fps: result.metrics.processing_fps, inference_fps: result.metrics.inference_fps, note: 'Evaluation of stored person detections, not identity accuracy; unlabeled frames excluded.' }, 'campus-trace-evaluation.json')}><Download size={15} />Tải báo cáo</button> : null}</div>
      {error ? <p className="ct-error" role="alert">{error}</p> : null}
      {report ? <><dl className="ct-evaluation-metrics"><div><dt>Precision · khung người</dt><dd>{percent(report.precision)}</dd></div><div><dt>Recall · khung người</dt><dd>{percent(report.recall)}</dd></div><div><dt>F1 · khung người</dt><dd>{percent(report.f1)}</dd></div><div><dt>Accuracy · có/không có người</dt><dd>{percent(report.frameAccuracy)}</dd></div></dl>
        <p>{report.dataset} · {report.labeledFrames} frame có nhãn ({report.positiveFrames} có người, {report.negativeFrames} không có người). TP {report.tp} · FP {report.fp} · FN {report.fn}.</p>
        {!report.negativeFrames ? <p className="ct-route-note">Chưa có frame âm tính; accuracy này chưa đánh giá được khả năng phân biệt cảnh không có người.</p> : null}</> : <p className="ct-route-note">Chưa có ground truth cho phiên này. Không dùng độ tin cậy detection hoặc màu áo làm số đo accuracy.</p>}
      <p className="ct-route-note">File nhãn được đọc trong trình duyệt. Chỉ frame có nhãn rõ ràng được tính; không chạy lại AI hoặc xem frame thiếu nhãn là âm tính.</p>
    </div>
  </details>;
}
