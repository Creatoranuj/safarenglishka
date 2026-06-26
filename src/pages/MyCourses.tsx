import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import BottomNav from "../components/Layout/BottomNav";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import Breadcrumbs from "../components/course/Breadcrumbs";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { Skeleton } from "../components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { 
  ArrowLeft, Search, PlayCircle, BookOpen, Clock, Calendar,
  Filter, GraduationCap, ChevronRight, Trash2, AlertTriangle
} from "lucide-react";
import { cn } from "../lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Link } from "react-router-dom";
import { useToast } from "../hooks/use-toast";
import WhatsAppButton from "../components/common/WhatsAppButton";

interface EnrolledCourse {
  enrollmentId: number;
  id: number;
  title: string;
  description: string | null;
  grade: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  price: number | null;
  startDate: string | null;
  endDate: string | null;
  purchased_at: string;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  isDuplicate: boolean;
}

type StatusFilter = "all" | "in-progress" | "completed";
type PriceFilter = "all" | "paid" | "free";

// ── Static outside component ───────────────────────────────────────────────
const statusTabs: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in-progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
];

const priceTabs: { id: PriceFilter; label: string }[] = [
  { id: "paid", label: "Paid" },
  { id: "free", label: "Free" },
];

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const formatShortDate = (dateString: string) => {
  const d = new Date(dateString);
  return {
    day: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    year: d.getFullYear().toString(),
  };
};

const CourseCard = memo(({ course, onNavigate, onDelete }: {
  course: EnrolledCourse;
  onNavigate: (id: number) => void;
  onDelete: (enrollmentId: number, title: string) => void;
}) => (
  <Card className={cn(
    "overflow-hidden hover:shadow-lg transition-all cursor-pointer group border-border relative",
    course.isDuplicate && "border-destructive/30 bg-destructive/5"
  )}>
    {course.isDuplicate && (
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-destructive/90 text-destructive-foreground text-xs px-2 py-0.5 rounded-full">
        <AlertTriangle className="h-3 w-3" />
        Duplicate
      </div>
    )}

    <div className="relative h-40 bg-muted overflow-hidden" onClick={() => onNavigate(course.id)}>
      <img
        src={course.thumbnailUrl || course.imageUrl || '/placeholder.svg'}
        alt={course.title}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <PlayCircle className="h-14 w-14 text-white" />
      </div>
      <Badge className="absolute top-3 left-3 bg-primary text-primary-foreground">
        Class {course.grade || 'General'}
      </Badge>
    </div>

    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3
          className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors cursor-pointer flex-1"
          onClick={() => onNavigate(course.id)}
        >
          {course.title}
        </h3>
        <WhatsAppButton
          message={`Hi, I need help with my course: ${course.title}`}
          title={`Ask about ${course.title} on WhatsApp`}
        />
      </div>
      {course.description && (
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{course.description}</p>
      )}

      {/* Start / End date strip */}
      {(course.startDate || course.endDate) && (
        <div className="flex items-center justify-between gap-2 text-xs bg-muted/40 border border-border rounded-lg px-3 py-2 mb-3">
          {course.startDate && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>Starts on</span>
              <span className="font-semibold text-foreground">{formatShortDate(course.startDate).day} {formatShortDate(course.startDate).year}</span>
            </div>
          )}
          {course.endDate && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="text-muted-foreground/60">•</span>
              <span>Ends on</span>
              <span className="font-semibold text-foreground">{formatShortDate(course.endDate).day} {formatShortDate(course.endDate).year}</span>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">
            {course.totalLessons === 0
              ? "No lessons yet"
              : `${course.completedLessons}/${course.totalLessons} completed`}
          </span>
          <span className="text-primary font-medium">
            {course.totalLessons === 0 ? "—" : `${course.progressPercent}%`}
          </span>
        </div>
        <Progress value={course.progressPercent} className="h-1.5" />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDate(course.purchased_at)}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all",
              course.isDuplicate ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(course.enrollmentId, course.title);
            }}
            title="Remove enrollment"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 text-primary"
            onClick={() => onNavigate(course.id)}
          >
            {course.progressPercent > 0 ? (
              <>Continue <ChevronRight className="h-4 w-4" /></>
            ) : (
              <>Start Learning <ChevronRight className="h-4 w-4" /></>
            )}
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
));
CourseCard.displayName = "CourseCard";

const MyCourses = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [courses, setCourses] = useState<EnrolledCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [sortBy, setSortBy] = useState("recent");

  const [deleteTarget, setDeleteTarget] = useState<{ enrollmentId: number; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── useCallback so useEffect dep array is stable ──────────────────────────
  const fetchEnrolledCourses = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      // ── 3 queries → 2 parallel groups (enrollments → then progress+lessons) ─
      const { data: enrollments, error } = await supabase
        .from('enrollments')
        .select('*, courses(*)')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (error) throw error;

      const courseIds = (enrollments || []).map((e: any) => e.course_id);

      // Fetch progress and lessons in parallel
      const [progressRes, lessonsRes] = await Promise.all([
        supabase
          .from('user_progress')
          .select('lesson_id, completed, course_id')
          .eq('user_id', user.id),
        supabase
          .from('lessons')
          .select('id, course_id')
          .in('course_id', courseIds.length > 0 ? courseIds : [-1]),
      ]);

      const progressData = progressRes.data || [];
      const allLessons = lessonsRes.data || [];

      const courseIdCounts: Record<number, number> = {};
      (enrollments || []).forEach((e: any) => {
        courseIdCounts[e.course_id] = (courseIdCounts[e.course_id] || 0) + 1;
      });

      const seenCourseIds: Record<number, number> = {};

      const enrolledCourses: EnrolledCourse[] = (enrollments || []).map((enrollment: any) => {
        const course = enrollment.courses;
        if (!course) return null;

        const courseLessons = allLessons.filter((l: any) => l.course_id === course.id);
        const courseLessonIds = new Set(courseLessons.map((l: any) => l.id));
        // Use lesson_id fallback in case course_id is null in user_progress records
        const completedLessons = progressData.filter(
          (p: any) => p.completed && (p.course_id === course.id || courseLessonIds.has(p.lesson_id))
        );
        const totalLessons = courseLessons.length;
        const progressPercent = totalLessons > 0
          ? Math.round((completedLessons.length / totalLessons) * 100)
          : 0;

        seenCourseIds[course.id] = (seenCourseIds[course.id] || 0) + 1;
        const isDuplicate = courseIdCounts[course.id] > 1 && seenCourseIds[course.id] > 1;

        return {
          enrollmentId: enrollment.id,
          id: course.id,
          title: course.title,
          description: course.description,
          grade: course.grade,
          imageUrl: course.image_url,
          thumbnailUrl: course.thumbnail_url,
          price: course.price,
          startDate: course.start_date ?? null,
          endDate: course.end_date ?? null,
          purchased_at: enrollment.purchased_at || new Date().toISOString(),
          totalLessons,
          completedLessons: completedLessons.length,
          progressPercent,
          isDuplicate,
        };
      }).filter(Boolean) as EnrolledCourse[];

      setCourses(enrolledCourses);
    } catch (error) {
      console.error("Error fetching enrolled courses:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchEnrolledCourses();
  }, [fetchEnrolledCourses]);

  // Refetch when window regains focus (e.g., returning from MyCourseDetail)
  useEffect(() => {
    const handleFocus = () => fetchEnrolledCourses();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchEnrolledCourses]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('enrollments')
        .delete()
        .eq('id', deleteTarget.enrollmentId)
        .eq('user_id', user?.id);

      if (error) throw error;

      setCourses(prev => prev.filter(c => c.enrollmentId !== deleteTarget.enrollmentId));
      toast({ title: "Enrollment removed ✓", description: `"${deleteTarget.title}" हटा दिया गया।` });
    } catch (err) {
      toast({ title: "Error", description: "Could not remove enrollment. Try again.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  // ── Memoised derived list ─────────────────────────────────────────────────
  const filteredCourses = useMemo(() =>
    courses
      .filter(c => {
        if (searchQuery.trim() && !c.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        if (gradeFilter !== "all" && c.grade !== gradeFilter) return false;
        if (statusFilter === "completed" && c.progressPercent < 100) return false;
        if (statusFilter === "in-progress" && (c.progressPercent === 0 || c.progressPercent >= 100)) return false;
        if (priceFilter === "paid" && !(c.price && c.price > 0)) return false;
        if (priceFilter === "free" && c.price && c.price > 0) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.title.localeCompare(b.title);
        if (sortBy === "progress") return b.progressPercent - a.progressPercent;
        return new Date(b.purchased_at).getTime() - new Date(a.purchased_at).getTime();
      }),
    [courses, searchQuery, gradeFilter, statusFilter, priceFilter, sortBy]
  );

  const grades = useMemo(
    () => [...new Set(courses.map(c => c.grade).filter(Boolean))] as string[],
    [courses]
  );

  const duplicateCount = useMemo(
    () => courses.filter(c => c.isDuplicate).length,
    [courses]
  );

  const handleNavigate = useCallback((id: number) => navigate(`/my-courses/${id}`), [navigate]);
  const handleDelete = useCallback((enrollmentId: number, title: string) => setDeleteTarget({ enrollmentId, title }), []);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <CardTitle>Login Required</CardTitle>
            <CardDescription>Please login to view your purchased courses</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => navigate('/login')}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background nb-smooth-scroll">
      <header className="bg-card border-b sticky top-0 z-20 safe-area-top">
        <div className="container mx-auto px-4 py-2 min-h-[52px] flex items-center">
          <div className="flex items-center gap-3">
            <Button aria-label="Back to dashboard" variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">My Courses</h1>
              <p className="text-sm text-muted-foreground">
                {courses.length} {courses.length === 1 ? 'course' : 'courses'} enrolled
                {duplicateCount > 0 && (
                  <span className="ml-2 text-destructive font-medium">• {duplicateCount} duplicate{duplicateCount > 1 ? 's' : ''} found</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </header>

      <Breadcrumbs
        segments={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "My Courses" },
        ]}
      />

      {duplicateCount > 0 && (
        <div className="container mx-auto px-4 pt-4">
          <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Duplicate Enrollments Detected!</p>
              <p className="text-destructive/80 text-xs mt-0.5">
                {duplicateCount} duplicate enrollment{duplicateCount > 1 ? 's' : ''} found. Orange-bordered cards are duplicates — click 🗑️ to remove them.
              </p>
            </div>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        {/* Paid / Free segmented pill */}
        <div className="flex justify-center mb-4">
          <div className="inline-flex items-center gap-1 bg-muted/60 rounded-full p-1">
            {priceTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPriceFilter(priceFilter === tab.id ? "all" : tab.id)}
                className={cn(
                  "px-6 py-1.5 rounded-full text-sm font-semibold transition-all",
                  priceFilter === tab.id
                    ? "bg-background text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-none">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                statusFilter === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search your courses..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recent</SelectItem>
              <SelectItem value="progress">Progress</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
          <Select value={gradeFilter} onValueChange={setGradeFilter}>
            <SelectTrigger className="w-full sm:w-36">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
              {grades.map((grade) => (
                <SelectItem key={grade} value={grade}>Class {grade}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-40 w-full" />
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && courses.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <GraduationCap className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Courses Yet</h3>
              <p className="text-muted-foreground text-center mb-6 max-w-md">Browse our catalog to find the perfect course.</p>
              <Button onClick={() => navigate('/courses')}>
                <BookOpen className="h-4 w-4 mr-2" /> Browse Courses
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && courses.length > 0 && filteredCourses.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Results</h3>
              <Button variant="outline" onClick={() => { setSearchQuery(""); setGradeFilter("all"); setStatusFilter("all"); }}>
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && filteredCourses.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((course) => (
              <CourseCard
                key={course.enrollmentId}
                course={course}
                onNavigate={handleNavigate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      <BottomNav />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Enrollment?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>"{deleteTarget?.title}"</strong> from your courses?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MyCourses;
