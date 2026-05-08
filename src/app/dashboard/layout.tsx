"use client";

import { useTheme } from "@/components/ThemeProvider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div className={`min-h-screen w-full transition-colors duration-500 ${isDark ? "mesh-bg-dark" : "mesh-bg-light"}`}>
      <main className="pt-4 px-4 pb-8 w-full max-w-390 mx-auto">
        {children}
      </main>
    </div>
  );
}
