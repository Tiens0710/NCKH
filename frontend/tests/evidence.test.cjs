const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const vm = require('node:vm'); const ts = require('typescript');
const target = { exports: {} }; vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/evidence.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module:target, exports:target.exports });
const { appearances, directEvidence, exportEvidenceCsv } = target.exports;
const {cameraJourney}=target.exports;
test('map direction requires confirmed identity and synchronized clocks, and rejection removes the link',()=>{
 const result=fixture();const confirmation=[{id:'n',track_key:'T1',other_track_key:'T2',decision:'same',created_at:1}];
 assert.equal(cameraJourney(result,[],'T1').edges[0].directed,false);
 assert.equal(cameraJourney(result,confirmation,'T1').edges[0].directed,true);
 result.cameras[0].timeline_known=false;assert.equal(cameraJourney(result,confirmation,'T1').edges[0].directed,false);
 assert.equal(cameraJourney(result,[{...confirmation[0],decision:'different'}],'T1').edges.length,0);
});
const fixture = () => ({ tracks:[1,2,3].map(i=>({track_key:`T${i}`,camera_id:`C${i}`,local_track_id:i,clothing_colors:{upper:{name:'white'},lower:{name:'black'}}})),
  cameras:[1,2,3].map(i=>({camera_id:`C${i}`,name:`Camera ${i}`,timeline_known:true,timeline_start_seconds:i*10,frames:[{time_seconds:1,detections:[{local_track_id:i,score:.9,xyxy:[1,2,4,8]}]},{time_seconds:2,detections:[{local_track_id:i,score:.95,xyxy:[2,3,5,9]}]}]})),links:[{from_track:'T1',to_track:'T2',similarity:.92},{from_track:'T2',to_track:'T3',similarity:.99}] });
test('observations use actual detections and pick the highest-score crop frame',()=>{ const rows=appearances(fixture()); assert.equal(rows.length,3);assert.equal(rows[0].first,1);assert.equal(rows[0].last,2);assert.equal(rows[0].portraitTime,2); });
test('manual rejection overrides AI and latest review overrides older confirmation',()=>{const result=fixture(); const notes=[{id:'a',track_key:'T1',other_track_key:'T2',decision:'same',created_at:1},{id:'b',track_key:'T2',other_track_key:'T1',decision:'different',created_at:2}];assert.equal(directEvidence(result,notes,'T1').rows.length,1);assert.equal(directEvidence(result,[],'T1').rows.length,2);});
test('same-person evidence remains direct and unknown clocks block inferred chronological ordering',()=>{const result=fixture();result.cameras[0].timeline_known=false; const evidence=directEvidence(result,[],'T1');assert.equal(evidence.synchronized,false);assert.equal(evidence.rows.some(row=>row.track.track_key==='T3'),false);});
test('simultaneous conflicting manual decisions never silently confirm identity',()=>{const result=fixture(); const notes=[{id:'a',track_key:'T1',other_track_key:'T2',decision:'same',created_at:1},{id:'b',track_key:'T1',other_track_key:'T2',decision:'different',created_at:1}]; assert.equal(directEvidence(result,notes,'T1').rows.length,1);});
test('CSV export does not invent a common timestamp and neutralizes spreadsheet formulas',()=>{const result=fixture();result.cameras[0].timeline_known=false;result.cameras[0].name='=HYPERLINK("evil")';const csv=exportEvidenceCsv(appearances(result));assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('"1","2",""'));});
