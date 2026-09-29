import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rock Paper Scissors AI",
  description: "Beat the AI, win a prize.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
