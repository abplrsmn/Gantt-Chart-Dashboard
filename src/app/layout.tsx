import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({
  weight: ["400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Aryaduta Dashboard",
  description: "Aryaduta Group Project Management Dashboard",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved theme is persisted in a cookie by ThemeProvider; set the initial
  // <html> class from it during SSR so there's no white flash and no inline
  // script (React 19 warns on inline scripts rendered by components).
  const cookieStore = await cookies();
  const resolvedTheme = cookieStore.get("theme")?.value === "light" ? "light" : "dark";

  return (
    <html lang="en" className={resolvedTheme} suppressHydrationWarning>
      <body
        className={`${inter.variable} antialiased bg-slab-bg dark:bg-slate-900 text-slate-900 dark:text-white transition-colors duration-500`}
      >
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}


