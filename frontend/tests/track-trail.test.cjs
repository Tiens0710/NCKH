const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const target={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/track-trail.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:target,exports:target.exports});
const {trackTrail}=target.exports;
const frame=(time,id=1)=>({time_seconds:time,detections:id===null?[]:[{local_track_id:id,xyxy:[time*10,0,time*10+4,20]}]});
const plain=value=>JSON.parse(JSON.stringify(value));
test('trails use observed foot points for one ID and never future detections',()=>{
 const camera={fps:10,frames:[frame(0),frame(.1),frame(.2,2),frame(.3),frame(.4),frame(.5)]};
 assert.deepEqual(plain(trackTrail(camera,1,.4)),[[[2,20],[3,20]],[[5,20],[6,20]]]);
});
test('a missing detection or time gap splits the path and stale trails disappear after seeking',()=>{
 const camera={fps:10,frames:[frame(0),frame(.1),frame(.2,null),frame(.3),frame(.4),frame(5),frame(5.1)]};
 const paths=plain(trackTrail(camera,1,5.1));assert.equal(paths.length,3);assert.equal(paths[2][0][0],52);
 assert.deepEqual(plain(trackTrail(camera,1,20)),[]);assert.deepEqual(plain(trackTrail(camera,1,.05)),[]);
});
