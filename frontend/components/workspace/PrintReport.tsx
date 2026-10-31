"use client";
import { Printer } from 'lucide-react';
export function PrintReport() { return <button className="ct-button" onClick={() => window.print()}><Printer size={16} />In báo cáo</button>; }
