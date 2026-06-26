import { memo } from "react";
import { SmartImage } from "../common/SmartImage";

interface ProfileAvatarProps {
  avatarUrl?: string | null;
  fullName?: string | null;
  userId?: string;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  className?: string;
}

const sizeMap = {
  sm: "h-8 w-8 text-sm",
  md: "h-20 w-20 text-2xl",
  lg: "h-28 w-28 text-4xl",
};

// Generate consistent color from user ID
const getAvatarColor = (id?: string): string => {
  if (!id) return "hsl(var(--primary))";
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 50%)`;
};

const getInitials = (name?: string | null): string => {
  if (!name) return "U";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0][0].toUpperCase();
};

const ProfileAvatar = memo(({ avatarUrl, fullName, userId, size = "sm", onClick, className = "" }: ProfileAvatarProps) => {
  const sizeClass = sizeMap[size];
  const bgColor = getAvatarColor(userId);

  return (
    <div
      onClick={onClick}
      className={`relative rounded-full overflow-hidden flex items-center justify-center font-bold border-2 border-background shadow-md select-none ${sizeClass} ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={avatarUrl ? undefined : { backgroundColor: bgColor }}
    >
      {avatarUrl ? (
        <SmartImage
          src={avatarUrl}
          alt={fullName || "Avatar"}
          width={size === "lg" ? 224 : size === "md" ? 160 : 64}
          height={size === "lg" ? 224 : size === "md" ? 160 : 64}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
          }}
        />
      ) : null}
      <span className={`text-white ${avatarUrl ? "hidden" : ""}`}>
        {getInitials(fullName)}
      </span>
    </div>
  );
});

ProfileAvatar.displayName = "ProfileAvatar";
export default ProfileAvatar;
