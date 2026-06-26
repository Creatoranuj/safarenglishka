import { X, Home, BookOpen, Users, Calendar, FileText, MessageCircle, Settings, LogOut, User, Bell, Library, ShieldCheck, Bot, Download, Video } from "lucide-react";
import { GraduationCap } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner";
import logo from "../../assets/brand/safar-logo.png";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  icon: React.ElementType;
  label: string;
  path: string;
  adminOrTeacher?: boolean;
}

const menuItems: MenuItem[] = [
  { icon: Home, label: "Dashboard", path: "/dashboard" },
  { icon: GraduationCap, label: "My Courses", path: "/my-courses" },
  { icon: BookOpen, label: "Courses", path: "/courses" },
  { icon: Library, label: "Books", path: "/books" },
  { icon: Download, label: "Downloads", path: "/downloads" },
  { icon: Video, label: "Doubt Sessions", path: "/doubts" },
  
  { icon: Bell, label: "Notices", path: "/notices" },
  { icon: Users, label: "Community", path: "/community" },
  { icon: Users, label: "Students", path: "/students", adminOrTeacher: true },
  { icon: Calendar, label: "Attendance", path: "/attendance", adminOrTeacher: true },
  { icon: FileText, label: "Reports", path: "/reports" },
  { icon: MessageCircle, label: "Messages", path: "/messages" },
  { icon: User, label: "Profile", path: "/profile" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, logout, isAuthenticated, isAdmin, isTeacher } = useAuth();

  const handleLogout = () => {
    logout();
    onClose();
    toast.success("Logged out successfully");
    navigate("/");
  };

  const visibleItems = menuItems.filter(item => {
    if (item.adminOrTeacher) return isAdmin || isTeacher;
    return true;
  });

  const getIsActive = (path: string) =>
    path === "/dashboard"
      ? location.pathname === path
      : location.pathname.startsWith(path);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-72 bg-sidebar z-50 shadow-xl transition-transform duration-300 flex flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border safe-area-top">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo" width={40} height={40} loading="eager" decoding="async" className="h-10 w-10 rounded-lg" />
            <span className="font-bold text-lg text-sidebar-foreground">
              Safar English Ka
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {visibleItems.map((item) => {
            const active = getIsActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 mx-2 rounded-xl transition-colors",
                  active
                    ? "bg-primary/15 text-primary font-semibold"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon className={cn("h-5 w-5", active && "text-primary")} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}

          {/* Admin Links — admin only */}
          {isAuthenticated && isAdmin && (
            <>
              <Link
                to="/admin"
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 mx-2 mt-2 rounded-xl transition-colors",
                  location.pathname === "/admin"
                    ? "bg-primary/15 text-primary font-semibold"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
                )}
              >
                <ShieldCheck className="h-5 w-5" />
                <span className="font-medium">Admin Panel</span>
              </Link>
              <Link
                to="/admin/chatbot"
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 mx-2 mt-1 rounded-xl transition-colors",
                  getIsActive("/admin/chatbot")
                    ? "bg-primary/15 text-primary font-semibold"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
                )}
              >
                <Bot className="h-5 w-5" />
                <span className="font-medium">Chatbot Settings</span>
              </Link>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border safe-area-bottom">
          {isAuthenticated && user && (
            <div className="mb-3 px-2">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{profile?.fullName || 'User'}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">{user.email}</p>
            </div>
          )}
          {isAuthenticated ? (
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full justify-start gap-3 text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            >
              <LogOut className="h-5 w-5" />
              <span>Logout</span>
            </Button>
          ) : (
            <Link to="/login" onClick={onClose}>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              >
                <LogOut className="h-5 w-5" />
                <span>Login</span>
              </Button>
            </Link>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
