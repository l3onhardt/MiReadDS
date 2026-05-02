"use client";
import { X, Users } from "lucide-react";

interface Character {
  id: number;
  name: string;
  voice_name: string | null;
  role_type: string;
}

interface CharacterPanelProps {
  characters: Character[];
  activeCharacterName: string | null;
  isOpen: boolean;
  onToggle: () => void;
}

export function CharacterPanel({ characters, activeCharacterName, isOpen, onToggle }: CharacterPanelProps) {
  const roleLabel = (t: string) => ({ main: "主角", supporting: "配角", background: "背景" }[t] || t);

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:block w-48 flex-shrink-0">
        <div className="glass p-3 sticky top-20">
          <div className="flex items-center gap-1.5 mb-3">
            <Users size={14} style={{ color: "var(--muted)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>角色</span>
          </div>
          <div className="space-y-1.5">
            {characters.map((c) => (
              <div key={c.id} className="px-2 py-1.5 rounded-lg text-xs transition-all"
                style={{
                  backgroundColor: c.name === activeCharacterName ? "var(--glass-bg)" : "transparent",
                  color: c.name === activeCharacterName ? "var(--accent)" : "var(--muted)",
                  fontWeight: c.name === activeCharacterName ? 600 : 400,
                }}
              >
                <div>{c.name}</div>
                <div className="opacity-60">{roleLabel(c.role_type)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile button */}
      <button onClick={onToggle} className="lg:hidden fixed bottom-4 right-4 w-11 h-11 rounded-full flex items-center justify-center shadow-lg z-20"
        style={{ backgroundColor: "var(--accent)", color: "var(--bg)" }}
      >
        <Users size={18} />
      </button>

      {/* Mobile bottom sheet */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-30" onClick={onToggle}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute bottom-0 left-0 right-0 p-4 rounded-t-2xl max-h-[50vh] overflow-y-auto"
            style={{ backgroundColor: "var(--bg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium">角色列表</span>
              <button onClick={onToggle}><X size={18} /></button>
            </div>
            <div className="space-y-2">
              {characters.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-2 rounded-lg"
                  style={{ backgroundColor: c.name === activeCharacterName ? "var(--glass-bg)" : "transparent" }}
                >
                  <div>
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>{roleLabel(c.role_type)}</div>
                  </div>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>{c.voice_name || "默认"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
