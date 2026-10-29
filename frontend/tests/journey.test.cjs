const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const target = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/journey.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: target, exports: target.exports });
const { journeyObservations } = target.exports;
function fixture() {
  return { tracks: [1, 2, 3].map(i => ({ track_key: `T${i}`, camera_id: `CAM-${i}`, local_track_id: i })),
    links: [{ from_track: 'T1', to_track: 'T2' }, { from_track: 'T2', to_track: 'T3' }],
    cameras: [1, 2, 3].map(i => ({ camera_id: `CAM-${i}`, timeline_start_seconds: 4 - i, timeline_known: true,
      frames: [{ time_seconds: 0, detections: [{ local_track_id: i }] }, { time_seconds: 1, detections: [{ local_track_id: i }] }] })) };
}
test('a candidate link is not treated as transitive identity evidence', () => {
  const observations = journeyObservations(fixture(), 'T1');
  assert.equal(observations.length, 2);
  assert.equal(observations.some(row => row.track.track_key === 'T3'), false);
  assert.equal(observations[0].track.track_key, 'T2');
  assert.equal(observations[0].last, 1);
});
test('unknown clock offsets never create a chronological journey', () => {
  const result = fixture(); result.cameras[0].timeline_known = false;
  assert.equal(journeyObservations(result, 'T1')[0].track.track_key, 'T1');
  assert.equal(journeyObservations(result, 'missing').length, 0);
});
