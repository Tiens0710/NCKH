import type { Metadata } from 'next';
import Link from 'next/link';
import sections from '@/lib/web-report.json';
import { PrintReport } from '@/components/workspace/PrintReport';
import './report.css';

export const metadata: Metadata = { title: 'Báo cáo hệ thống | Campus Trace', description: 'Báo cáo ứng dụng web giám sát, tra cứu người và đối chiếu hành trình trong khuôn viên trường học.' };
export default function ReportPage() {
  return <div className="ct-report-page">
    <div className="ct-report-toolbar"><Link href="/workspace">← Về màn hình camera</Link><PrintReport /></div>
    <div className="ct-report-layout"><article className="ct-report-paper" aria-labelledby="report-title">
      <header><p className="ct-report-kicker">CAMPUS TRACE / BÁO CÁO PHÁT TRIỂN</p><h1 id="report-title">Ứng dụng web giám sát và tìm kiếm người trong khuôn viên trường học</h1><p className="ct-report-date">Cập nhật ngày 31/10/2026</p></header>
      {sections.map((section, index) => <section id={`muc-${index+1}`} key={section.title}><h2>{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}
      <footer>Campus Trace · Báo cáo hiện trạng triển khai ứng dụng web</footer>
    </article><aside className="ct-report-index" aria-label="Mục lục báo cáo"><p>Trong báo cáo</p><nav>{sections.map((section,index) => <a href={`#muc-${index+1}`} key={section.title}>{section.title}</a>)}</nav><div><strong>Phạm vi báo cáo</strong><p>Chức năng đã triển khai và giới hạn hiện tại. Kết quả kiểm thử web không phải độ chính xác của mô hình AI.</p></div></aside></div>
  </div>;
}
