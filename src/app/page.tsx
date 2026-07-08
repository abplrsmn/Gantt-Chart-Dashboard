"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense } from "react";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState(searchParams.get("error") === "AccessDenied" ? "Akun Google kamu belum terdaftar. Hubungi admin." : "");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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
        const resolved = saved === "system"
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

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError("");
    await signIn("google", { callbackUrl: "/api/auth/post-login" });
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

        {/* Google SSO button */}
        <button
          onClick={handleGoogle}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all text-sm font-semibold text-slate-700 disabled:opacity-60 shadow-sm active:scale-[0.98]"
        >
          {googleLoading ? (
            <svg className="animate-spin w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          ) : (
            <GoogleIcon />
          )}
          {googleLoading ? "Redirecting…" : "Sign in with Google"}
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
          Access restricted to Aryaduta Group accounts.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
