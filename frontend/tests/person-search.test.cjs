const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path) {
  const target = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: target, exports: target.exports });
  return target.exports;
}
const { searchPeople } = load('lib/person-search.ts');
const { visibleDetections } = load('lib/person-overlay.ts');
const track = (id, upper, lower) => ({ track_key: `CAM-1:${id}`, camera_id: 'CAM-1', local_track_id: id,
  clothing_colors: { upper: { name: upper }, lower: { name: lower } } });
const tracks = [track(1, 'white', 'black'), track(2, 'black', 'white'), track(3, 'blue', 'black'), track(4, 'unknown', 'black')];
test('BM25 binds colors to body parts, normalizes Vietnamese and excludes conflicting colors', () => {
  for (const query of ['áo trắng quần đen', 'AO TRANG QUAN DEN', 'tìm người áo trắng quần đen', 'shirt white pants black']) {
    const results = searchPeople(tracks, query);
    assert.equal(results.length, 1); assert.equal(results[0].track.local_track_id, 1);
    assert.ok(results[0].score > 0);
  }
  assert.equal(searchPeople(tracks, 'áo xanh dương quần đen')[0].track.local_track_id, 3);
  assert.equal(searchPeople(tracks, 'áo đỏ').length, 0);
  assert.equal(searchPeople(tracks, 'áo trắng balô').length, 0);
  assert.equal(searchPeople(tracks, 'không áo trắng').length, 0);
  assert.equal(searchPeople(tracks, '').length, 4);
  assert.equal(searchPeople(tracks, 'quần đen').length, 3);
});
test('focus draws only selected local ID, other cameras hide all and stale frames vanish', () => {
  const a = { local_track_id: 1 }, b = { local_track_id: 2 };
  const camera = { fps: 6, frames: [{ time_seconds: 0, detections: [a, b] }, { time_seconds: .33, detections: [b] }] };
  assert.equal(visibleDetections(camera, .1, 1).length, 1);
  assert.equal(visibleDetections(camera, .1, 1)[0], a);
  assert.equal(visibleDetections(camera, .4, 1).length, 0);
  assert.equal(visibleDetections(camera, .1, null).length, 2);
  assert.equal(visibleDetections(camera, .1, null, true).length, 0);
  assert.equal(visibleDetections(camera, 2, null).length, 0);
  assert.equal(visibleDetections(camera, -.1, null).length, 0);
});
