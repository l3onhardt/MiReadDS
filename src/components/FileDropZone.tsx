"use client";
import { useState, useCallback } from "react";
import { Upload } from "lucide-react";

interface FileDropZoneProps {
  onFile: (file: File) => void;
  loading: boolean;
}

export function FileDropZone({ onFile, loading }: FileDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <label
      className="flex flex-col items-center justify-center gap-4 p-10 md:p-14 rounded-2xl border-2 border-dashed cursor-pointer transition-all"
      style={{
        borderColor: dragOver ? "var(--accent)" : "var(--border)",
        backgroundColor: dragOver ? "rgba(92,77,60,0.05)" : "transparent",
      }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".txt,.epub"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
        disabled={loading}
      />
      {loading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: "var(--muted)", borderTopColor: "var(--accent)" }} />
          <p style={{ color: "var(--muted)" }}>正在解析...</p>
        </div>
      ) : (
        <>
          <Upload size={36} style={{ color: "var(--muted)" }} />
          <div className="text-center">
            <p className="font-medium">拖拽文件到此处，或点击选择</p>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              支持 TXT、EPUB 格式
            </p>
          </div>
        </>
      )}
    </label>
  );
}
