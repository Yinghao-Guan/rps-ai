import type { Metadata } from "next";
import "@fontsource/russo-one/400.css";
import "@fontsource/roboto-mono/400.css";
import "@fontsource/roboto-mono/500.css";
import "@fontsource/roboto-mono/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "CS Club @ SMC · Rock Paper Scissors AI",
  description: "Beat the AI, win a prize.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
