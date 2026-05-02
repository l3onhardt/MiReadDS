import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  onClick?: () => void;
}

export function GlassCard({ children, className, as: Tag = "div", onClick }: GlassCardProps) {
  return (
    <Tag
      className={cn(
        "glass transition-all duration-200",
        onClick && "cursor-pointer hover:scale-[1.01] active:scale-[0.99]",
        className
      )}
      onClick={onClick}
    >
      {children}
    </Tag>
  );
}
