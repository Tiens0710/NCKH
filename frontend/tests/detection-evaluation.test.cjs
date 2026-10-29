const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');const target={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/detection-evaluation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:target,exports:target.exports});
const {evaluateDetections}=target.exports;
const box=[10,10,30,80],pred=(score=.9)=>({xyxy:box,score});
const fixture=()=>({cameras:[{camera_id:'C1',frames:[{frame_index:0,detections:[pred()]},{frame_index:1,detections:[pred()]},{frame_index:2,detections:[]},{frame_index:3,detections:[]},{frame_index:4,detections:Array.from({length:10},()=>pred())}]}]});
const label=(frame_index,boxes)=>({camera_id:'C1',frame_index,boxes});
test('a label file from another job is rejected even if its camera and frame IDs happen to match',()=>{
 assert.throws(()=>evaluateDetections(fixture(),{source_id:'old-job',frames:[label(0,[box])]},'current-job'));
 assert.equal(evaluateDetections(fixture(),{source_id:'current-job',frames:[label(0,[box])]},'current-job').tp,1);
});
test('counts TP FP FN against independent labels, excludes unlabelled frames and measures presence accuracy separately',()=>{
 const report=evaluateDetections(fixture(),{dataset_name:'independent test',frames:[label(0,[box]),label(1,[]),label(2,[box]),label(3,[])]});
 assert.deepEqual([report.tp,report.fp,report.fn],[1,1,1]);assert.equal(report.labeledFrames,4);assert.equal(report.negativeFrames,2);
 assert.equal(report.precision,.5);assert.equal(report.recall,.5);assert.equal(report.f1,.5);assert.equal(report.frameAccuracy,.5);
});
test('two predictions cannot both match one ground truth person',()=>{const result=fixture();result.cameras[0].frames[0].detections.push(pred(.8));const report=evaluateDetections(result,{frames:[label(0,[box])]});assert.equal(report.tp,1);assert.equal(report.fp,1);assert.equal(report.recall,1);assert.equal(report.frameAccuracy,1);});
test('empty negative-only sets do not manufacture 100 percent detection precision or recall',()=>{const report=evaluateDetections(fixture(),{frames:[label(3,[])]});assert.equal(report.precision,null);assert.equal(report.recall,null);assert.equal(report.f1,null);assert.equal(report.frameAccuracy,1);assert.equal(report.positiveFrames,0);});
test('unfinished template, unknown frames and duplicate labels are rejected instead of silently changing scores',()=>{
 assert.throws(()=>evaluateDetections(fixture(),{frames:[label(0,null)]}));
 assert.throws(()=>evaluateDetections(fixture(),{frames:[label(99,[])]}));
 assert.throws(()=>evaluateDetections(fixture(),{frames:[label(0,[box]),label(0,[box])]}));
 assert.throws(()=>evaluateDetections(fixture(),{frames:[label(0,[[30,10,10,80]])]}));
});
