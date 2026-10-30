const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const target={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/realtime.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:target,exports:target.exports,URL});
const {realtimeSnapshot,frameFresh}=target.exports;
const endpoint='https://gateway.example/cameras/gate/latest';
const snapshot=()=>({camera_id:'gate',status:'ready',age_ms:100,simulation:true,model_status:'ready',source_status:'receiving',frame:{sequence:1,width:160,height:90,jpeg:'/9j/abc=',received_at:1,inference_ms:20,inference_fps:2,detections:[{xyxy:[1,2,50,60],label:'person',score:.9}]}});
test('AI overlays expire independently of successful polling and wrong camera/geometry are rejected',()=>{
 const data=realtimeSnapshot(snapshot(),endpoint);assert.equal(frameFresh(data,500),true);assert.equal(frameFresh(data,3000),false);
 assert.throws(()=>realtimeSnapshot({...snapshot(),camera_id:'yard'},endpoint));
 const invalid=snapshot();invalid.frame.detections[0].xyxy[2]=999;assert.throws(()=>realtimeSnapshot(invalid,endpoint));
 const stale=realtimeSnapshot({...snapshot(),status:'stale'},endpoint);assert.equal(stale.frame,null);assert.equal(frameFresh(stale,0),false);
});
