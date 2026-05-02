"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileDropZone } from "@/components/FileDropZone";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ImportPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleFile(file: File) {
    setLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/books", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "导入失败");
      }
      const book = await res.json();
      router.push(`/read/${book.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm mb-6" style={{ color: "var(--muted)" }}>
        <ArrowLeft size={16} /> 返回书架
      </Link>
      <h1 className="text-2xl font-semibold mb-6">导入小说</h1>
      <FileDropZone onFile={handleFile} loading={loading} />
      {error && (
        <div className="mt-4 p-3 rounded-lg text-sm" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#dc2626" }}>
          {error}
        </div>
      )}
    </div>
  );
}
