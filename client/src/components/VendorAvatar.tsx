import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface VendorAvatarProps {
  vendor: { id: string; name: string; logoStorageKey?: string | null };
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES: Record<string, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-20 w-20 text-2xl",
};

export function VendorAvatar({ vendor, size = "md", className }: VendorAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initial = (vendor.name?.trim()?.[0] ?? "V").toUpperCase();
  const hasLogo = !!vendor.logoStorageKey && !imgError;

  return (
    <Avatar className={cn(SIZE_CLASSES[size], "shrink-0", className)}>
      {hasLogo && (
        <AvatarImage
          src={`/api/vendors/${vendor.id}/logo`}
          alt={`${vendor.name} logo`}
          onError={() => setImgError(true)}
          className="object-contain"
        />
      )}
      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
