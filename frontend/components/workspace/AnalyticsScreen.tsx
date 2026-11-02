"use client";
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { sessionStats } from '@/lib/session-analytics';
import { appearances, exportEvidenceCsv, seconds } from '@/lib/evidence';
import { useWorkspace, downloadJson } from './WorkspaceProvider';
import { NoResult, ScreenTitle } from './WorkspacePrimitives';
import { TrackPortrait } from './TrackPortrait';
export function AnalyticsScreen({compact=false}:{compact?:boolean}) {
 const router=useRouter();const app=useWorkspace(),result=app.job?.result;
 const [camera,setCamera]=useState('');
 const stats=useMemo(()=>sessionStats(result,camera),[result,camera]);
 const rows=useMemo(()=>result?appearances(result).filter(r=>!camera||r.camera.camera_id===camera):[],[result,camera]);
 const peak=Math.max(1,...stats.buckets.map(b=>b.count));
 function csv(){const url=URL.createObjectURL(new Blob([exportEvidenceCsv(rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='campus-trace-observations.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 if(compact&&!result)return <section className="ct-panel ct-ops-empty"><h2>Thống kê phiên phân tích</h2><p>Biểu đồ và sự kiện xuất hiện khi mở kết quả đã phân tích.</p><Link href="/workspace/analytics">Mở thống kê</Link></section>;
 return <section className={compact?'ct-dashboard-analytics':'ct-analytics-page'}>
 {!compact?<ScreenTitle title="Báo cáo và phân tích" description="Thống kê từ các khung hình thực của phiên đang mở. Không suy diễn số người duy nhất hoặc lưu lượng 24 giờ." action={<button onClick={()=>window.print()}>In báo cáo phiên</button>}/>:null}
 {!result?<NoResult/>:<><div className="ct-ops-toolbar">{!compact&&app.data?.jobs.length?<label>Phiên phân tích<select value={app.jobId} onChange={e=>{setCamera('');app.selectJob(e.target.value);}}>{app.replay?<option value="">Dữ liệu minh họa</option>:null}{app.data.jobs.map(job=><option key={job.id} value={job.id}>{job.name} · {new Date(job.created_at).toLocaleDateString('vi-VN')}</option>)}</select></label>:null}<h2>{compact?'Tần suất phát hiện':'Phạm vi thống kê'}</h2><label>Camera<select value={camera} onChange={e=>setCamera(e.target.value)}><option value="">Tất cả camera</option>{result.cameras.map(c=><option key={c.camera_id} value={c.camera_id}>{c.name}</option>)}</select></label>{compact?<Link href="/workspace/analytics">Xem báo cáo chi tiết</Link>:<><button onClick={csv}>Xuất CSV</button><button onClick={()=>downloadJson({scope:'current-session',stats},'campus-trace-stats.json')}>Xuất JSON</button></>}</div>
 {!compact?<dl className="ct-ops-metrics"><div><dt>Khung hình có dữ liệu</dt><dd>{stats.frames}</dd></div><div><dt>Khung hình có người</dt><dd>{stats.withPeople}</dd></div><div><dt>Tổng khung bao</dt><dd>{stats.detections}</dd></div><div><dt>Đoạn theo dõi</dt><dd>{stats.tracks}</dd></div></dl>:null}
 <div className="ct-panel ct-observation-chart"><div role="img" aria-label={`Biểu đồ ${stats.detections} khung bao trong ${stats.duration.toFixed(1)} giây video`} className="ct-ops-bars">{stats.buckets.map((b,i)=><div key={i}><span>{b.count}</span><i style={{height:`${b.count/peak*110+2}px`}}/><small>{seconds(b.start)}</small></div>)}</div><p className="ct-caption">Trục thời gian tính từ đầu mỗi video; mỗi cột đếm khung bao, không phải số người riêng biệt.{!stats.synchronized?' Các camera chưa đồng bộ thời gian.':''}</p></div>
 {!compact?<div className="ct-panel ct-table-scroll"><table><thead><tr><th>Camera</th><th>Khung hình</th><th>Khung bao</th><th>Đoạn theo dõi</th><th>Vị trí</th></tr></thead><tbody>{stats.byCamera.map(c=><tr key={c.id}><td>{c.name}</td><td>{c.frames}</td><td>{c.detections}</td><td>{c.tracks}</td><td>{c.located?'Đã cung cấp':'Chưa xác định'}</td></tr>)}</tbody></table></div>:null}
 <section className="ct-panel"><div className="ct-section-head"><h2>Các lần xuất hiện được ghi nhận</h2><span>{rows.length} đoạn</span></div><div className="ct-event-list">{rows.slice(0,compact?4:30).map(row=><button key={row.track.track_key} onClick={()=>{app.setSelection({trackKey:row.track.track_key,cameraId:row.camera.camera_id,trackId:row.track.local_track_id,seconds:row.first,revision:Date.now()});router.push('/workspace/journey');}}><TrackPortrait row={row}/><span><strong>{row.camera.name} · L{row.track.local_track_id}</strong><small>{seconds(row.first)}–{seconds(row.last)} · áo {row.track.clothing_colors?.upper?.label??'chưa rõ'}</small></span><span>Xem bằng chứng →</span></button>)}</div></section>
 </>}
 </section>;
}
