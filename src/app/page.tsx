"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const applyTheme = () => {
    try {
      const saved = localStorage.getItem("theme") || "dark";
      const resolved = saved === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
        : saved;
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(resolved);
    } catch { /* ignore */ }
  };

  const doLogin = async (loginEmail: string, loginPassword: string) => {
    const res  = await fetch("/api/auth/login", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: loginEmail, password: loginPassword }),
    });
    const data = await res.json();
    if (!res.ok || !data?.success) {
      setError(data?.error || "Invalid credentials. Please check your email and password.");
      return false;
    }
    applyTheme();
    router.push("/dashboard");
    router.refresh();
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await doLogin(email, password);
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    setError("");
    setGoogleLoading(true);
    window.location.assign("/api/auth/signin/google?callbackUrl=%2Fdashboard");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slab-bg">
      <div
        className="w-full max-w-sm mx-4 bg-white rounded-3xl p-8 flex flex-col items-center"
        style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)" }}
      >
        {/* Title */}
        <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase mb-6">
          Keystone
        </h1>

        {/* Google SSO */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all text-sm font-semibold text-slate-700 disabled:opacity-60 shadow-sm active:scale-[0.98]"
        >
          {googleLoading ? (
            <svg className="animate-spin w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          ) : (
            <span className="w-4 h-4 rounded-full border-[3px] border-blue-500 border-r-red-500 border-b-yellow-400 border-l-green-500" />
          )}
          {googleLoading ? "Redirecting to Google…" : "Continue with Google"}
        </button>

        {/* Divider */}
        <div className="w-full flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400 font-medium">or</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* Email/password form */}
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
            disabled={loading || googleLoading}
            className="w-full py-3 mt-1 disabled:opacity-60 text-white rounded-xl font-semibold text-sm transition-all active:scale-[0.98] glass-btn-primary"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-xs text-slate-400 text-center mt-5 leading-relaxed">
          Only approved accounts can access the dashboard.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <LoginForm />;
}
