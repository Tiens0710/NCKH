"""Prepare attributed, independent P-DESTRE campus clips for the camera wall."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import av
import cv2

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.multicam.video_io import H264Writer

CLIPS = [('14-07-2019-1-1', 3), ('10-07-2019-1-3', 2), ('12-11-2019-1-3', 10)]
CITATION = ('S.V. Aruna Kumar, Ehsan Yaghoubi, Abhijit Das, B.S. Harish and Hugo Proenca. '
            'The P-DESTRE: A Fully Annotated Dataset for Pedestrian Detection, Tracking, '
            'Re-Identification and Search from Aerial Devices. IEEE TIFS, 2020. DOI:10.1109/TIFS.2020.3040881.')


def prepare():
    output = ROOT / 'frontend/public/demo/samples/pdestre-campus'
    output.mkdir(parents=True, exist_ok=True)
    cameras, hashes = [], {}
    for index, (stem, start) in enumerate(CLIPS, 1):
        source = ROOT / '.cache/pdestre-download/source/P-DESTRE/videos' / f'{stem}.MP4'
        target = output / f'CAM-{index}.mp4'
        writer, count = None, 0
        with av.open(str(source)) as video:
            stream = video.streams.video[0]
            fps = min(25, float(stream.average_rate))
            video.seek(int(start / stream.time_base), stream=stream, backward=True)
            next_time = float(start)
            try:
                for frame in video.decode(video=0):
                    timestamp = float(frame.time)
                    if timestamp >= start + 15 or count >= round(fps * 15):
                        break
                    if timestamp + .00001 < next_time:
                        continue
                    image = frame.to_ndarray(format='bgr24')
                    height, width = image.shape[:2]
                    size = (960, int(height * 960 / width) // 2 * 2)
                    image = cv2.resize(image, size)
                    if writer is None:
                        writer = H264Writer(target, fps, *size)
                        writer.stream.options = {'crf': '28', 'preset': 'fast'}
                        cv2.imwrite(str(target.with_suffix('.jpg')), image)
                    writer.write(image)
                    count += 1
                    next_time = start + count / fps
            finally:
                if writer:
                    writer.close()
        if count < round(fps * 14):
            raise RuntimeError(f'Clip too short: {stem}')
        cameras.append({'name': f'P-DESTRE · cảnh {index}', 'file': f'pdestre-campus/CAM-{index}.mp4',
                        'size': target.stat().st_size, 'source_file': f'{stem}.MP4', 'source_start_seconds': start,
                        'duration_seconds': count / fps, 'fps': fps})
        hashes[stem] = hashlib.sha256(source.read_bytes()).hexdigest()
        print(f'Prepared {target.name}: {count} frames, {fps:g} FPS, {target.stat().st_size:,} bytes', flush=True)
    scene = {'id': 'pdestre-campus', 'title': 'P-DESTRE · khuôn viên đại học', 'short_label': 'P-DESTRE · khuôn viên',
             'description': 'Ba cảnh quay trong khuôn viên đại học từ thiết bị bay. Các cảnh khác phiên, không phải ba camera đồng bộ.',
             'challenge': 'Góc cao UAV · người đi bộ · che khuất · nhiều người',
             'source_name': 'SOCIA Lab. / University of Beira Interior & JSS Science and Technology University',
             'source_url': 'https://p-destre.di.ubi.pt/', 'license': 'CC BY-NC-SA 4.0 · ghi nguồn, phi thương mại, chia sẻ tương tự',
             'license_url': 'https://creativecommons.org/licenses/by-nc-sa/4.0/', 'attribution': CITATION,
             'changes': 'Trích 15 giây từ mỗi video gốc, thu nhỏ 960px, H.264 tối đa 25 FPS, bỏ âm thanh; không vẽ bounding box. Ba phiên độc lập, chưa đồng bộ thời gian.',
             'simulation': False, 'synchronized': False, 'duration_seconds': 15, 'cameras': cameras}
    manifest = ROOT / 'frontend/lib/demo-open-datasets.generated.json'
    entries = json.loads(manifest.read_text(encoding='utf-8'))
    entries = [scene] + [entry for entry in entries if entry['id'] != scene['id']]
    manifest.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (ROOT / 'frontend/public/demo/samples/OPEN-DATA-ATTRIBUTION.json').write_text(
        json.dumps({'purpose': 'Non-commercial research demonstration; licenses apply per dataset', 'datasets': entries}, ensure_ascii=False, indent=2), encoding='utf-8')
    (output / 'ATTRIBUTION.json').write_text(json.dumps({'dataset': scene, 'source_sha256': hashes}, ensure_ascii=False, indent=2), encoding='utf-8')
    (output / 'LICENSE.txt').write_text(CITATION + '\n\nSource: https://p-destre.di.ubi.pt/\n'
        'These adapted clips are licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International.\n'
        'https://creativecommons.org/licenses/by-nc-sa/4.0/\n\n' + scene['changes'] + '\n', encoding='utf-8')
    return scene


def publish(scene):
    import httpx
    credentials = json.loads((ROOT / '.cache/live-demo-credentials.json').read_text())
    with httpx.Client(timeout=90, headers={'apikey': credentials['SUPABASE_SECRET_KEY'], 'Authorization': f"Bearer {credentials['SUPABASE_SECRET_KEY']}"}) as client:
        for camera in scene['cameras']:
            path = ROOT / 'frontend/public/demo/samples' / camera['file']
            response = client.post(credentials['SUPABASE_URL'] + '/storage/v1/object/multicam-demo/samples/' + camera['file'],
                                   content=path.read_bytes(), headers={'Content-Type': 'video/mp4', 'x-upsert': 'true'})
            if not response.is_success:
                raise RuntimeError(f'Publish failed HTTP {response.status_code}')
            print('Published', camera['file'], flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--publish', action='store_true'); args = parser.parse_args()
    result = prepare()
    if args.publish:
        publish(result)
