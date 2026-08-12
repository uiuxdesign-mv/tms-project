import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/toast-provider";
import { ConfirmProvider } from "@/components/confirm-provider";
import { ThemeProvider, ThemeInitScript } from "@/components/theme-provider";
import { LanguageProvider, LanguageInitScript } from "@/components/language-provider";

// Font Inter — sama dengan aplikasi PHP lama (di sana di-self-host, di sini cukup lewat
// next/font/google supaya tidak perlu menaruh file .woff2 secara manual).
const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TMS — Task Management System",
  description: "Enterprise Task Management System",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <ThemeInitScript />
        <LanguageInitScript />
      </head>
      <body className="min-h-full flex flex-col bg-white text-gray-900">
        <ThemeProvider>
          <LanguageProvider>
            <ToastProvider>
              <ConfirmProvider>{children}</ConfirmProvider>
            </ToastProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
