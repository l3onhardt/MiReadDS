"use client";

interface Segment {
  id: number;
  segment_index: number;
  type: "narration" | "dialogue";
  character_id: number | null;
  text: string;
  character_name?: string;
}

interface ReadingContentProps {
  segments: Segment[];
  activeSegmentIndex: number;
}

const CHARACTER_COLORS = ["#c4956a", "#8c9e6b", "#6b8a9e", "#9e6b8a", "#6b9e8c", "#9e8c6b", "#8a6b9e", "#6b9e9e"];

export function ReadingContent({ segments, activeSegmentIndex }: ReadingContentProps) {
  const charColorMap = new Map<string, string>();
  let colorIdx = 0;
  for (const seg of segments) {
    if (seg.character_name && !charColorMap.has(seg.character_name)) {
      charColorMap.set(seg.character_name, CHARACTER_COLORS[colorIdx % CHARACTER_COLORS.length]);
      colorIdx++;
    }
  }

  return (
    <div className="glass p-5 md:p-8">
      <div className="leading-relaxed md:leading-loose space-y-4 text-serif">
        {segments.map((seg) => {
          const isActive = seg.segment_index === activeSegmentIndex;
          const charColor = seg.character_name ? charColorMap.get(seg.character_name) : undefined;
          return (
            <p key={seg.id}
              className={`transition-all duration-300 px-3 py-1.5 -mx-3 rounded-lg ${isActive ? "ring-1" : ""}`}
              style={{
                color: seg.type === "dialogue" && charColor ? charColor : "var(--text)",
                backgroundColor: isActive ? "var(--glass-bg)" : "transparent",
                borderColor: isActive ? "var(--accent)" : "transparent",
                opacity: isActive ? 1 : 0.6,
                fontSize: isActive ? "1.05em" : "1em",
              }}
            >
              {seg.text}
            </p>
          );
        })}
      </div>
    </div>
  );
}
