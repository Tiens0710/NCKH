const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const target={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/camera-connection.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:target,exports:target.exports,URL});
const {gatewayConfig}=target.exports;
test('gateway export uses saved RTSP variable names and coordinates, without stream URLs or assumed synchronization',()=>{
 const cameras=[1,2].map(i=>({name:`Camera ${i}`,source:'rtsp',location:{lat:10+i/1000,lng:105},connection:{protocol:'rtsp',rtsp_env:`GATE_${i}_RTSP`,stream_url:'https://private.example/live.m3u8'}}));
 const exported=JSON.parse(JSON.stringify(gatewayConfig(cameras,'https://campus.example/workspace')));
 assert.equal(exported.web_url,'https://campus.example');assert.equal(exported.consent,false);assert.equal(exported.cameras.length,2);
 assert.equal(exported.cameras[1].rtsp_url_env,'GATE_2_RTSP');assert.equal(exported.cameras[0].location.lat,10.001);
 assert.equal(JSON.stringify(exported).includes('private.example'),false);assert.equal('timeline_start_seconds' in exported.cameras[0],false);
});
test('gateway export rejects missing cameras and duplicated RTSP variable references',()=>{
 assert.throws(()=>gatewayConfig([],'https://campus.example'));
 assert.throws(()=>gatewayConfig([1,2].map(i=>({name:`Camera ${i}`,source:'rtsp',connection:{rtsp_env:'SAME_RTSP'}})),'https://campus.example'));
});
