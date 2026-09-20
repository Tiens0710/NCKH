import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NCKH · Outlier Re-ID",
    template: "%s · NCKH",
  },
  description: "Giao diện quản lý và truy vết người trên hệ thống đa camera.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
