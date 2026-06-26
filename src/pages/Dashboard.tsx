import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { Badge } from "../components/ui/badge";
import { 
  PlayCircle, Zap, 
  ClipboardCheck, FileText, Users, Calendar, Trophy, CheckCircle2, XCircle,
  Download, X,
} from "lucide-react";
import appLogo from "../assets/branding/logo_icon_web.webp";
import BatchSelector from "../components/dashboard/BatchSelector";
import HeroCarousel from "../components/dashboard/HeroCarousel";
import UpcomingSchedule from "../components/dashboard/UpcomingSchedule";
import LiveBadge from "../components/live/LiveBadge";

import BottomNav from "../components/Layout/BottomNav";
import cubeIcon from "../assets/icons/cube-3d.png";
import checkmarkIcon from "../assets/icons/checkmark-3d.png";
import doubtsIcon from "../assets/icons/doubts-3d.png";
import scienceIcon from "../assets/icons/science-3d.png";
import bellIcon from "../assets/icons/bell-3d.png";
import UpcomingLiveSessions from "../components/live/UpcomingLiveSessions";
import { Video } from "lucide-react";


const studentQuickActions = [
  { iconSrc: cubeIcon, label: "All Classes", path: "/all-classes", bg: "bg-blue-50 dark:bg-blue-950/30" },
  { iconSrc: checkmarkIcon, label: "All Tests", path: "/all-tests", bg: "bg-purple-50 dark:bg-purple-950/30" },
  { iconSrc: doubtsIcon, label: "My Doubts", path: "/doubts", bg: "bg-teal-50 dark:bg-teal-950/30" },
  { iconSrc: scienceIcon, label: "Library", path: "/materials", bg: "bg-pink-50 dark:bg-pink-950/30" },
  { iconSrc: bellIcon, label: "Notices", path: "/notices", bg: "bg-orange-50 dark:bg-orange-950/30" },
  { iconSrc: checkmarkIcon, label: "Performance", path: "/reports", bg: "bg-green-50 dark:bg-green-950/30" },
];

// ── Static outside component — recreated on every render otherwise ─────────
const teacherFeatures = [
  { icon: ClipboardCheck, label: "Attendance", color: "text-blue-600 bg-blue-100", path: "/attendance" },
  { icon: FileText, label: "Report Card", color: "text-purple-600 bg-purple-100", path: "/reports" },
  { icon: Users, label: "Students", color: "text-green-600 bg-green-100", path: "/students" },
  { icon: Calendar, label: "Timetable", color: "text-orange-600 bg-orange-100", path: "/timetable" },
];

interface QuizAttemptRow {
  id: string;
  quiz_id: string;
  score: number | null;
  percentage: number | null;
  passed: boolean | null;
  created_at: string | null;
  quizzes: {
    title: string;
    type: string | null;
    total_marks: number | null;
  } | null;
}

const Dashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { user, profile, role, isAuthenticated, isLoading: authLoading } = useAuth();

  const [myCourses, setMyCourses] = useState<any[]>([]);
  const [progressPercent, setProgressPercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttemptRow[]>([]);
  const [upcomingDoubts, setUpcomingDoubts] = useState<{ id: string; subject: string | null; scheduled_at: string | null; zoom_join_url: string | null; status: string }[]>([]);
  const [showInstallBanner, setShowInstallBanner] = useState<boolean>(() => {
    const dismissed = localStorage.getItem('install-banner-dismissed') === 'true';
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    return !dismissed && !standalone;
  });

  const handleDismissBanner = () => {
    localStorage.setItem('install-banner-dismissed', 'true');
    setShowInstallBanner(false);
  };

  // Prefetch likely next-routes once the Dashboard mounts. Browsers will
  // download these chunks at low priority while the user reads the dashboard,
  // so navigation feels instant. Errors are swallowed — this is purely a hint.
  useEffect(() => {
    const idle = (cb: () => void) =>
      typeof (window as any).requestIdleCallback === "function"
        ? (window as any).requestIdleCallback(cb)
        : setTimeout(cb, 1200);
    idle(() => {
      import("./MyCourses").catch(() => {});
      import("./LessonView").catch(() => {});
      import("./AllClasses").catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !user) return;

    const fetchDashboardData = async () => {
      try {
        setLoading(true);

        const [enrollmentsRes, attemptsRes, doubtsRes, progressRes] = await Promise.all([
          supabase
            .from('enrollments')
            .select('*, courses(*)')
            .eq('user_id', user!.id)
            .eq('status', 'active'),
          supabase
            .from('quiz_attempts')
            .select('id, quiz_id, score, percentage, passed, created_at, submitted_at, quizzes(title, type, total_marks)')
            .eq('user_id', user!.id)
            .not('submitted_at', 'is', null)
            .order('created_at', { ascending: false })
            .limit(10),
          supabase
            .from('doubt_sessions')
            .select('id, subject, scheduled_at, zoom_join_url, status')
            .eq('student_id', user!.id)
            .in('status', ['scheduled', 'active'])
            .order('scheduled_at', { ascending: true })
            .limit(3),
          supabase
            .from('user_progress')
            .select('lesson_id, completed, course_id')
            .eq('user_id', user!.id),
        ]);

        if (enrollmentsRes.data && enrollmentsRes.data.length > 0) {
          const progressData = progressRes.data || [];

          // Fetch lesson counts for enrolled courses
          const courseIds = enrollmentsRes.data.map((e: any) => e.course_id).filter(Boolean);
          const lessonsRes = courseIds.length > 0
            ? await supabase.from('lessons').select('id, course_id').in('course_id', courseIds)
            : { data: [] };
          const allLessons = lessonsRes.data || [];

          // Deduplicate by course id — keep first occurrence only
          const seenIds = new Set<number>();
          const enrolled = enrollmentsRes.data
            .filter((e: any) => {
              const cid = e.courses?.id;
              if (!cid || seenIds.has(cid)) return false;
              seenIds.add(cid);
              return true;
            })
            .map((e: any) => {
              const courseId = e.courses?.id;
              const courseLessons = allLessons.filter((l: any) => l.course_id === courseId);
              const courseLessonIds = new Set(courseLessons.map((l: any) => l.id));
              const completedCount = progressData.filter(
                (p: any) => p.completed && (p.course_id === courseId || courseLessonIds.has(p.lesson_id))
              ).length;
              const total = courseLessons.length;
              const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
              return {
                id: courseId,
                title: e.courses?.title,
                description: e.courses?.description,
                grade: e.courses?.grade,
                imageUrl: e.courses?.image_url,
                thumbnailUrl: e.courses?.thumbnail_url,
                progressPercent: pct,
              };
            });
          setMyCourses(enrolled);
          setProgressPercent(enrolled[0]?.progressPercent || 0);
        }

        if (attemptsRes.data) {
          setQuizAttempts(attemptsRes.data as QuizAttemptRow[]);
        }
        if (doubtsRes.data) {
          setUpcomingDoubts(doubtsRes.data);
        }
      } catch (error) {
        console.error("Error loading dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [navigate, isAuthenticated, authLoading, user]);

  

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="relative">
          <img src={appLogo} alt="Loading" className="h-16 w-16 rounded-2xl sadhguru-loader-logo" />
          <div className="absolute inset-0 rounded-2xl border-2 border-primary/40 sadhguru-loader-ring" />
        </div>
        <p className="mt-4 text-muted-foreground font-medium">Please wait & Deep Breath</p>
      </div>
    );
  }

  const isTeacher = role === 'teacher' || role === 'admin';

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col font-sans">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <Header 
        onMenuClick={() => setSidebarOpen(true)} 
        userName={profile?.fullName || "User"} 
      />

      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full pb-20 md:pb-6">

        {isTeacher ? (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-foreground">Quick Actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {teacherFeatures.map((feature, idx) => (
                <div 
                  key={idx} 
                  onClick={() => navigate(feature.path)}
                  className="bg-card p-6 rounded-xl border border-border hover:shadow-md transition-all cursor-pointer flex flex-col items-center justify-center gap-3 text-center group"
                >
                  <div className={`p-3 rounded-full ${feature.color} group-hover:scale-110 transition-transform`}>
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <span className="font-semibold text-foreground">{feature.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {showInstallBanner && (
              <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-primary to-accent rounded-xl px-4 py-3 shadow-md">
                <div className="flex items-center gap-3 min-w-0">
                  <Download className="h-5 w-5 flex-shrink-0 text-primary-foreground" />
                  <span className="text-sm font-medium truncate text-primary-foreground">
                    Install the Safar English Ka app for a better experience
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-xs h-8"
                    onClick={() => navigate('/install')}
                  >
                    Install Now →
                  </Button>
                  <button
                    onClick={handleDismissBanner}
                    className="p-1 rounded-full hover:bg-primary-foreground/20 transition-colors text-primary-foreground"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          <BatchSelector />
          <HeroCarousel />
          <LiveBadge />
            <UpcomingLiveSessions />
            <UpcomingSchedule />
            {myCourses.length > 0 ? (
              <Card
                className="overflow-hidden shadow-sm cursor-pointer group hover:shadow-md transition-shadow"
                onClick={() => navigate(`/my-courses/${myCourses[0].id}`)}
              >
                <div className="flex flex-col sm:flex-row">
                  <div className="sm:w-48 h-36 sm:h-auto bg-muted relative overflow-hidden flex-shrink-0">
                    <img 
                      src={myCourses[0].thumbnailUrl || myCourses[0].imageUrl || "/placeholder.svg"} 
                      alt={myCourses[0].title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <PlayCircle className="h-10 w-10 text-white" />
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-center gap-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-xs">
                        Class {myCourses[0].grade || "General"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Continue where you left</span>
                    </div>
                    <h3 className="text-lg font-bold text-foreground line-clamp-1">{myCourses[0].title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {myCourses[0].description || "Keep pushing your limits!"}
                    </p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-medium text-muted-foreground">
                        <span>Progress</span>
                        <span>{progressPercent}%</span>
                      </div>
                      <Progress value={progressPercent} className="h-2" />
                    </div>
                    <Button size="sm" className="mt-1 w-fit bg-accent text-accent-foreground hover:bg-accent/90">
                      <Zap className="h-4 w-4 mr-1" /> Resume
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="border-2 border-dashed p-10 text-center">
                <img src={cubeIcon} alt="No courses" width={48} height={48} className="w-12 h-12 object-contain mx-auto mb-3" loading="lazy" decoding="async" />
                <h3 className="font-bold text-lg text-foreground">No active courses</h3>
                <p className="text-muted-foreground mb-4">Enroll in a course to start learning.</p>
                <Button onClick={() => navigate('/courses')}>Browse Courses</Button>
              </Card>
            )}

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
              {studentQuickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => navigate(action.path)}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${action.bg}`}>
                    <img
                      src={action.iconSrc}
                      alt={action.label}
                      width={40}
                      height={40}
                      className="w-10 h-10 object-contain"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">{action.label}</span>
                </button>
              ))}
            </div>

            {/* Practice Tests & Quiz Attempts moved to Performance (/reports) */}

            {/* My Batches section removed — same courses already shown in Continue Learning hero card above */}

            {/* Upcoming Doubt Sessions card */}
            {upcomingDoubts.length > 0 && (
              <Card
                className="border border-primary/20 bg-primary/5 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate("/doubts")}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary/10 shrink-0">
                    <Video className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {upcomingDoubts.length} Upcoming Zoom Session{upcomingDoubts.length > 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {upcomingDoubts[0].subject || "Doubt Session"} —{" "}
                      {upcomingDoubts[0].scheduled_at
                        ? new Date(upcomingDoubts[0].scheduled_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                        : "Scheduled"}
                    </p>
                  </div>
                  <Badge className="bg-primary/10 text-primary border-primary/20 shrink-0">Join</Badge>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default Dashboard;
