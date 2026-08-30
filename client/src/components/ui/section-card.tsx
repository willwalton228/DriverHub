import { type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  headerRight?: React.ReactNode;
  "data-testid"?: string;
}

export function SectionCard({
  title,
  icon: Icon,
  children,
  className,
  contentClassName,
  headerRight,
  "data-testid": testId,
}: SectionCardProps) {
  return (
    <Card className={cn("bg-card", className)} data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 text-primary shrink-0" />}
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </div>
        {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
      </CardHeader>
      <CardContent className={cn("space-y-4 pt-0", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
