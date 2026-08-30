import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

interface UserAvatarProps {
  photoUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  size?: AvatarSize;
  className?: string;
  fallbackClassName?: string;
  "data-testid"?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: "h-6 w-6",
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-16 w-16",
  xl: "h-20 w-20",
};

const textSizeClasses: Record<AvatarSize, string> = {
  xs: "text-[9px]",
  sm: "text-xs",
  md: "text-sm",
  lg: "text-lg",
  xl: "text-2xl",
};

export function getAvatarInitials(
  firstName?: string | null,
  lastName?: string | null,
  email?: string | null
): string {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  if (firstName) {
    return firstName[0].toUpperCase();
  }
  if (email) {
    return email[0].toUpperCase();
  }
  return "?";
}

export function UserAvatar({
  photoUrl,
  firstName,
  lastName,
  email,
  size = "md",
  className,
  fallbackClassName,
  "data-testid": testId,
}: UserAvatarProps) {
  const initials = getAvatarInitials(firstName, lastName, email);
  const altText = [firstName, lastName].filter(Boolean).join(" ") || email || "User";

  return (
    <Avatar className={cn(sizeClasses[size], className)} data-testid={testId}>
      <AvatarImage src={photoUrl || undefined} alt={altText} />
      <AvatarFallback className={cn(textSizeClasses[size], fallbackClassName)}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
