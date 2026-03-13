"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [isDark, setIsDark] = useState(true);
  const [email, setEmail] = useState("admin@aryaduta.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");

  // Simple toggle for preview purposes
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email === "admin@aryaduta.com" && password === "admin123") {
      router.push("/dashboard");
    } else {
      setError("Invalid credentials. Please check your email and password.");
    }
  };

  return (
    <div className={`min-h-screen w-full flex items-center justify-center transition-colors duration-500 ${isDark ? 'mesh-bg-dark' : 'mesh-bg-light'}`}>
      
      {/* Theme Toggle (Top Right) */}
      <div className="absolute top-4 right-4">
        <button 
          onClick={() => setIsDark(!isDark)}
          className="p-2 rounded-full glass-panel hover:bg-white/50 dark:hover:bg-black/50 transition"
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Login Glass Card */}
      <div className="glass-panel w-full max-w-md p-8 rounded-3xl mx-4 relative overflow-hidden">
        {/* Subtle decorative glow inside card */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl"></div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-16 h-16 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg mb-6 text-white">
            <ShieldAlert size={32} />
          </div>
          
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2 text-center">
            Command Center
          </h1>
          <p className="text-slate-600 dark:text-slate-300 text-sm mb-8 text-center">
            Enter your credentials to access the workspace.
          </p>

          <form onSubmit={handleLogin} className="w-full space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 ml-1">Work Email</label>
              <input 
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                className="w-full px-4 py-3 rounded-xl bg-white/30 dark:bg-black/20 border border-white/40 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-800 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 shadow-inner"
                required
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 ml-1">Password</label>
              <input 
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                className="w-full px-4 py-3 rounded-xl bg-white/30 dark:bg-black/20 border border-white/40 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-800 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 shadow-inner"
                required
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 text-center -mt-1">{error}</p>
            )}

            <button 
              type="submit"
              className="w-full py-3 mt-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl font-medium shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98]"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
