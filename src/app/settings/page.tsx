"use client";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.api_key?.key) setApiKey(data.api_key.key);
        if (data.theme?.mode) setTheme(data.theme.mode);
      });
  }, []);

  async function saveSettings() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, theme }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    if (theme === "dark") document.documentElement.classList.add("dark");
    else if (theme === "light") document.documentElement.classList.remove("dark");
    else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", prefersDark);
    }
    localStorage.setItem("mireader-theme", theme);
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm mb-6" style={{ color: "var(--muted)" }}>
        <ArrowLeft size={16} /> 返回书架
      </Link>
      <h1 className="text-2xl font-semibold mb-6">设置</h1>

      <div className="space-y-6">
        <div className="glass p-5">
          <h2 className="font-medium mb-3">MiMo API Key</h2>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="输入你的 MiMo API Key"
            className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
          />
          <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
            在 platform.xiaomimimo.com 控制台获取
          </p>
        </div>

        <div className="glass p-5">
          <h2 className="font-medium mb-3">主题</h2>
          <div className="flex gap-2">
            {[
              { value: "system" as const, label: "跟随系统" },
              { value: "light" as const, label: "浅色" },
              { value: "dark" as const, label: "深色" },
            ].map(({ value, label }) => (
              <button key={value} onClick={() => setTheme(value)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  backgroundColor: theme === value ? "var(--accent)" : "var(--glass-bg)",
                  color: theme === value ? "var(--bg)" : "var(--text)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button onClick={saveSettings}
          className="w-full py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{ backgroundColor: "var(--accent)", color: "var(--bg)" }}
        >
          {saved ? "已保存 ✓" : "保存设置"}
        </button>

        <div className="text-center text-xs" style={{ color: "var(--muted)" }}>
          <p>MiReader v0.1 — 沉浸式有声小说朗读</p>
          <p className="mt-1">Powered by Xiaomi MiMo TTS</p>
        </div>
      </div>
    </div>
  );
}
