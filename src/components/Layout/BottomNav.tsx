import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { User, Download, ShieldCheck } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { tapLight } from "../../lib/nativeChrome";
import homeIcon from "../../assets/icons/home-3d.png";
import scienceIcon from "../../assets/icons/science-3d.png";
import studentIcon from "../../assets/icons/student-3d.png";

const studentTabs = [
  { path: "/dashboard", label: "Home", iconSrc: homeIcon },
  { path: "/courses", label: "Courses", iconSrc: scienceIcon },
  { path: "/my-courses", label: "My Courses", iconSrc: studentIcon },
];


const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isTeacher, isAdmin } = useAuth();
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setChatOpen(document.body.classList.contains('chat-fullscreen-open'));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  if (chatOpen) return null;

  const isActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === path;
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const go = (path: string) => {
    void tapLight();
    navigate(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-30 md:hidden safe-area-bottom nb-hide-on-kb">
      <div className="flex items-center justify-around h-16 px-1">
        {studentTabs.map(({ path, label, iconSrc }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => go(path)}
              aria-current={active ? "page" : undefined}
              className="relative flex flex-col items-center gap-0.5 flex-1 min-h-[44px] justify-center transition-transform active:scale-95"
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 h-9 w-12 rounded-full bg-accent/20"
                />
              )}
              <img
                src={iconSrc}
                alt=""
                width={22}
                height={22}
                className={`relative w-[22px] h-[22px] object-contain transition-all ${!active ? "opacity-40 grayscale" : ""}`}
                decoding="async"
              />
              <span className={`relative text-[10px] font-medium ${active ? "text-accent" : "text-muted-foreground"}`}>
                {label}
              </span>
            </button>
          );
        })}

        <button
          onClick={() => go("/downloads")}
          aria-current={isActive("/downloads") ? "page" : undefined}
          className="relative flex flex-col items-center gap-0.5 flex-1 min-h-[44px] justify-center transition-transform active:scale-95"
        >
          {isActive("/downloads") && (
            <span aria-hidden="true" className="absolute top-1 h-9 w-12 rounded-full bg-accent/20" />
          )}
          <Download
            size={22}
            className={`relative ${isActive("/downloads") ? "text-accent" : "text-muted-foreground opacity-40"}`}
          />
          <span className={`relative text-[10px] font-medium ${isActive("/downloads") ? "text-accent" : "text-muted-foreground"}`}>
            Downloads
          </span>
        </button>

        {(isTeacher || isAdmin) && (
          <button
            onClick={() => go("/admin")}
            aria-current={isActive("/admin") ? "page" : undefined}
            className="relative flex flex-col items-center gap-0.5 flex-1 min-h-[44px] justify-center transition-transform active:scale-95"
          >
            {isActive("/admin") && (
              <span aria-hidden="true" className="absolute top-1 h-9 w-12 rounded-full bg-accent/20" />
            )}
            <ShieldCheck
              size={22}
              className={`relative ${isActive("/admin") ? "text-accent" : "text-muted-foreground opacity-40"}`}
            />
            <span className={`relative text-[10px] font-medium ${isActive("/admin") ? "text-accent" : "text-muted-foreground"}`}>
              Admin
            </span>
          </button>
        )}

        <button
          onClick={() => go("/profile")}
          aria-current={isActive("/profile") ? "page" : undefined}
          className="relative flex flex-col items-center gap-0.5 flex-1 min-h-[44px] justify-center transition-transform active:scale-95"
        >
          {isActive("/profile") && (
            <span aria-hidden="true" className="absolute top-1 h-9 w-12 rounded-full bg-accent/20" />
          )}
          <User
            size={22}
            className={`relative ${isActive("/profile") ? "text-accent" : "text-muted-foreground opacity-40"}`}
          />
          <span className={`relative text-[10px] font-medium ${isActive("/profile") ? "text-accent" : "text-muted-foreground"}`}>
            Profile
          </span>
        </button>
      </div>
    </nav>
  );
};


export default BottomNav;
