"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

      try {
        const saved = localStorage.getItem("theme") || "dark";
        const resolved =
          saved === "system"
            ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
            : saved;
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(resolved);
      } catch { /* ignore */ }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slab-bg">
      <div
        className="w-full max-w-sm mx-4 bg-white rounded-3xl p-8 flex flex-col items-center"
        style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)" }}
      >
        {/* Logo */}
        <div className="w-20 h-20 rounded-2xl overflow-hidden mb-5 shadow-md">
          <img src="/aryaduta_logo.png" alt="Aryaduta" className="w-full h-full object-contain" />
        </div>

        {/* Title */}
        <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase mb-6">
          Aryaduta Dashboard
        </h1>

        {/* Divider */}
        <div className="w-full border-t border-slate-200 mb-6" />

        {/* Form */}
        <form onSubmit={handleLogin} className="w-full space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="Work email"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-sienna/40 focus:border-brand-sienna text-slate-800 placeholder:text-slate-400 text-sm transition-all"
            required
            autoComplete="email"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder="Password"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-sienna/40 focus:border-brand-sienna text-slate-800 placeholder:text-slate-400 text-sm transition-all"
            required
            autoComplete="current-password"
          />

          {error && (
            <p className="text-xs text-red-500 text-center font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 mt-1 disabled:opacity-60 text-white rounded-xl font-semibold text-sm transition-all active:scale-[0.98] glass-btn-primary"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-xs text-slate-400 text-center mt-5 leading-relaxed">
          Access restricted to Aryaduta Group accounts.
        </p>
      </div>
    </div>
  );
}
