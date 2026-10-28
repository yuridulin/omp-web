import type { Metadata, Viewport } from "next";
import "./base.css";

export const metadata: Metadata = {
  title: "omp",
  description: "Web UI for the oh-my-pi coding agent",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
