import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MiReader",
  description: "沉浸式有声小说朗读",
};

function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            var theme = localStorage.getItem('mireader-theme');
            if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
              document.documentElement.classList.add('dark');
            }
          })();
        `,
      }}
    />
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen antialiased">
        <ThemeScript />
        <main className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
