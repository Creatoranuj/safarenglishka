import { Menu, User } from "lucide-react";
import { Button } from "../ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useIsMobile } from "../../hooks/use-mobile";
import logoIcon from "../../assets/brand/safar-logo.png";
import NotificationDropdown from "./NotificationDropdown";
import ProfileAvatar from "../profile/ProfileAvatar";

interface HeaderProps {
  onMenuClick: () => void;
  userName?: string;
}

const Header = ({ onMenuClick, userName }: HeaderProps) => {
  const { user, profile, isAuthenticated } = useAuth();
  const isMobile = useIsMobile();
  const displayName = profile?.fullName ?? userName;

  return (
    <header
      className="flex items-center justify-between px-2 pl-safe-l pr-safe-r md:px-4 py-1.5 bg-card border-b border-border sticky top-0 z-40 safe-area-top min-h-[52px] md:min-h-[60px]"
    >
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="text-foreground hover:bg-muted h-8 w-8"
        >
          <Menu className="h-4.5 w-4.5" />
        </Button>
        <Link to="/" className="flex items-center gap-2" style={{ padding: '0 2px' }}>
          <img
            src={logoIcon}
            alt="Safar English Ka"
            className="h-8 w-8 rounded-full object-contain"
            width={32}
            height={32}
          />
          {!isMobile && (
            <span className="font-semibold text-lg text-foreground">
              Safar English Ka
            </span>
          )}
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <NotificationDropdown />
        {isAuthenticated ? (
          <Link to="/profile">
            <Button variant="ghost" size="icon" className="text-foreground hover:bg-muted relative">
              <ProfileAvatar
                avatarUrl={profile?.avatarUrl ?? null}
                fullName={displayName}
                userId={user?.id}
                size="sm"
              />
            </Button>
          </Link>
        ) : (
          <Link to="/login">
            <Button variant="ghost" size="icon" className="text-foreground hover:bg-muted">
              <User className="h-5 w-5" />
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
};

export default Header;
