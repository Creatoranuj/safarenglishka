import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home, GraduationCap, BookMarked, Download, User, ShieldCheck, type LucideIcon } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import type { TranslationKey } from "../../i18n/en";
import { selectionHaptic } from "../../lib/native/haptics";

type Tab = { path: string; labelKey: TranslationKey; Icon: LucideIcon; id: string };

const studentTabs: Tab[] = [
  { path: "/dashboard", labelKey: "nav.home", Icon: Home, id: "bottom-nav-home" },
  { path: "/courses", labelKey: "nav.courses", Icon: GraduationCap, id: "bottom-nav-courses" },
  { path: "/my-courses", labelKey: "nav.myCourses", Icon: BookMarked, id: "bottom-nav-my-courses" },
];

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isTeacher, isAdmin } = useAuth();
  const { t } = useLanguage();
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setChatOpen(document.body.classList.contains("chat-fullscreen-open"));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  if (chatOpen) return null;

  const isActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === path;
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const go = (path: string) => {
    if (location.pathname !== path) void selectionHaptic();
    navigate(path);
  };

  const renderTab = ({ path, labelKey, Icon, id }: Tab) => {
    const active = isActive(path);
    const label = t(labelKey);
    return (
      <button
        key={path}
        id={id}
        data-testid={id}
        onClick={() => go(path)}
        aria-current={active ? "page" : undefined}
        aria-label={label}
        className="relative flex flex-col items-center gap-0.5 flex-1 min-h-[44px] justify-center transition-transform active:scale-95"
      >
        {active && (
          <span
            aria-hidden="true"
            className="absolute top-1 h-9 w-12 rounded-full bg-accent/20"
          />
        )}
        <Icon
          size={22}
          strokeWidth={active ? 2.25 : 1.75}
          className={`relative ${active ? "text-accent" : "text-muted-foreground opacity-60"}`}
        />
        <span className={`relative text-nav font-medium ${active ? "text-accent" : "text-muted-foreground"}`}>
          {label}
        </span>
      </button>
    );
  };

  const tabs: Tab[] = [
    ...studentTabs,
    { path: "/downloads", labelKey: "nav.downloads", Icon: Download, id: "bottom-nav-downloads" },
    ...((isTeacher || isAdmin)
      ? [{ path: "/admin", labelKey: "nav.admin", Icon: ShieldCheck, id: "bottom-nav-admin" } as Tab]
      : []),
    { path: "/profile", labelKey: "nav.profile", Icon: User, id: "bottom-nav-profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-30 md:hidden safe-area-bottom safe-area-x nb-hide-on-kb">
      <div className="flex items-center justify-around h-16 px-1">
        {tabs.map(renderTab)}
      </div>
    </nav>
  );
};

export default BottomNav;
