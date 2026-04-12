import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyMCP — Dashboard",
  description: "Personal MCP Server Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-text antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
