import type { Metadata } from "next";
import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import "./workspace.css";
import "./operator.css";
import "./map-explorer.css";
export const metadata: Metadata = { title: "Campus Trace · Tìm người & hành trình", description: "Không gian quản lý camera, phân tích video và đối chiếu hành trình người trong khuôn viên." };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <WorkspaceProvider><WorkspaceShell>{children}</WorkspaceShell></WorkspaceProvider>;
}
