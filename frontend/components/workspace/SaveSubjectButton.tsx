"use client";
import { useState } from 'react';
import type { Appearance } from '@/lib/evidence';
import { useWorkspace } from './WorkspaceProvider';
import { Modal } from './Modal';
export function SaveSubjectButton({row}:{row:Appearance}){
 const app=useWorkspace(),[open,setOpen]=useState(false),[label,setLabel]=useState(''),[note,setNote]=useState(''),[watched,setWatched]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const allowed=!!app.access&&!app.replay&&!!app.jobId;
 return <><button disabled={!allowed} title={allowed?'Lưu đoạn theo dõi làm hồ sơ đối chiếu':'Mở phiên riêng đã phân tích để lưu hồ sơ'} onClick={()=>{setLabel(`Đối tượng L${row.track.local_track_id}`);setOpen(true);}}>Lưu hồ sơ</button>{message?<small role="status">{message}</small>:null}{open?<Modal titleId="save-subject-title" onClose={()=>!busy&&setOpen(false)}><h2 id="save-subject-title">Lưu hồ sơ đối chiếu</h2><p>Tên do người vận hành đặt, không phải danh tính được AI xác nhận.</p><form className="ct-form-stack" onSubmit={e=>{e.preventDefault();setBusy(true);void app.operate({action:'save_subject',label,note,watched,archived:false,job_id:app.jobId,track_key:row.track.track_key}).then(()=>{setOpen(false);setMessage('Đã lưu hồ sơ trên máy chủ.');}).catch(f=>app.setError(f.message)).finally(()=>setBusy(false));}}><label>Tên gợi nhớ<input required maxLength={80} value={label} onChange={e=>setLabel(e.target.value)}/></label><label>Ghi chú<textarea maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label><label className="ct-checkbox"><input type="checkbox" checked={watched} onChange={e=>setWatched(e.target.checked)}/>Đưa vào danh sách cần đối chiếu</label><div className="ct-inline-actions"><button type="button" disabled={busy} onClick={()=>setOpen(false)}>Hủy</button><button className="ct-primary" disabled={busy||!label.trim()}>{busy?'Đang lưu…':'Lưu hồ sơ'}</button></div></form></Modal>:null}</>;
}
