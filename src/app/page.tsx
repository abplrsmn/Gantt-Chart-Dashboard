"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res  = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok || !data?.success) {
        setError(data?.error || "Invalid credentials. Please check your email and password.");
        return;
      }

      // Restore the user's last saved theme before navigating to dashboard
      try {
        const saved = localStorage.getItem("theme") || "dark";
        const resolved =
          saved === "system"
            ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
            : saved;
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(resolved);
      } catch { /* ignore — theme will be applied by ThemeProvider on dashboard */ }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    // Always light/white background — independent of theme system
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{
        background:
          "radial-gradient(ellipse at 60% 20%, #ede9fe 0%, #f0f4ff 40%, #f8faff 100%)",
      }}
    >
      {/* Login Card — always light/white style */}
      <div
        className="w-full max-w-md p-8 rounded-3xl mx-4 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(241,245,255,0.94) 100%)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.6)",
          boxShadow:
            "0 4px 6px -1px rgba(0,0,0,0.1), 0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)",
        }}
      >
        {/* Decorative blobs */}
        <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl" style={{ background: "rgba(99,102,241,0.18)" }} />
        <div className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full blur-3xl" style={{ background: "rgba(139,92,246,0.15)" }} />

        <div className="relative z-10 flex flex-col items-center">
          {/* Logo */}
          <div className="w-16 h-16 bg-linear-to-tr from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 mb-6 text-white">
            <Activity size={32} />
          </div>

          <h1 className="text-2xl font-bold bg-linear-to-r from-blue-600 to-purple-500 bg-clip-text text-transparent mb-1.5 text-center">
            Project Dashboard
          </h1>
          <p className="text-slate-500 text-sm mb-8 text-center">
            Enter your credentials to access the workspace.
          </p>

          <form onSubmit={handleLogin} className="w-full space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 ml-0.5">
                Work Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder="Enter email"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 text-slate-800 placeholder:text-slate-400 shadow-sm transition-all"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 ml-0.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="Enter password"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 text-slate-800 placeholder:text-slate-400 shadow-sm transition-all"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 text-center -mt-1 font-medium">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-2 bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-60 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/25 transition-all active:scale-[0.98]"
            >
              {loading ? "Logging in…" : "Log In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
