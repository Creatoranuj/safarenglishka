import { useState, useEffect } from "react";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import BottomNav from "../components/Layout/BottomNav";
import CourseCard, { CourseProps } from "../components/courses/CourseCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { useAdminEnrollment } from "../hooks/useAdminEnrollment";
import { useAuth } from "../contexts/AuthContext";
import Breadcrumbs from "../components/course/Breadcrumbs";
import { formatDuration } from "../components/video/MahimaVideoPlayer";
import { toast } from "sonner";


const Courses = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const navigate = useNavigate();
  const { adminEnroll, isAdmin, isEnrolling } = useAdminEnrollment();
  const { user } = useAuth();

  const [courseList, setCourseList] = useState<CourseProps[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const [lessonCounts, setLessonCounts] = useState<Record<number, { count: number; duration: number }>>({});

  useEffect(() => {
    fetchCourses();
    fetchEnrollments();
    fetchLessonCounts();
  }, [user]);

  const fetchLessonCounts = async () => {
    try {
      const { data, error } = await supabase
        .from("lessons")
        .select("course_id, duration");
      if (!error && data) {
        const counts: Record<number, { count: number; duration: number }> = {};
        data.forEach((l: any) => {
          if (!l.course_id) return;
          if (!counts[l.course_id]) counts[l.course_id] = { count: 0, duration: 0 };
          counts[l.course_id].count++;
          counts[l.course_id].duration += (l.duration || 0);
        });
        setLessonCounts(counts);
      }
    } catch (err) {
      console.error("Error fetching lesson counts:", err);
    }
  };

  const fetchEnrollments = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("enrollments")
        .select("course_id, status")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (!error && data) {
        setEnrolledCourseIds(new Set(data.map((e: any) => e.course_id)));
      }
    } catch (error) {
      console.error("Error fetching enrollments:", error);
    }
  };

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        const safeData = data.map((item: any) => ({
          id: item.id,
          title: item.title,
          grade: Number(item.grade) || 0,
          image_url: item.image_url || item.thumbnail_url || "https://placehold.co/600x400/png?text=Course+Image",
          description: item.description || "No description available",
          price: Number(item.price) || 0,
          rating: 4.8,
          duration: "0m",
          lessons_count: 0,
        }));
        setCourseList(safeData);
      }
    } catch (error) {
      console.error("Error fetching courses:", error);
    } finally {
      setLoading(false);
    }
  };

  const gradeOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const filteredCourses = selectedGrade === "all"
    ? courseList
    : courseList.filter((c) => String(c.grade) === String(selectedGrade));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      <Breadcrumbs segments={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "All Courses" },
      ]} />

      <main className="flex-1 p-4 space-y-4 pb-20 md:pb-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading..." : `${filteredCourses.length} courses available`}
          </p>
          <Select value={selectedGrade} onValueChange={setSelectedGrade}>
            <SelectTrigger className="w-32 bg-card border-border">
              <SelectValue placeholder="All Grades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
              {gradeOptions.map((grade) => (
                <SelectItem key={grade} value={String(grade)}>
                  Grade {grade}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading courses...</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCourses.map((course) => {
              const stats = lessonCounts[course.id];
              const enriched = {
                ...course,
                lessons_count: stats?.count || 0,
                duration: stats && stats.duration > 0 ? formatDuration(stats.duration) : "",
              };
              const isEnrolled = enrolledCourseIds.has(course.id);
              return (
                <CourseCard 
                  key={course.id} 
                  course={enriched}
                  isAdmin={isAdmin}
                  onAdminEnroll={adminEnroll}
                  isEnrolling={isEnrolling}
                  isEnrolled={isEnrolled}
                  onEnrollFree={course.price === 0 && !isEnrolled ? async () => {
                    if (!user) {
                      toast.error("Please login to enroll");
                      return;
                    }
                    try {
                      const { error } = await supabase.from("enrollments").upsert(
                        { user_id: user.id, course_id: course.id, status: "active" },
                        { onConflict: "user_id,course_id", ignoreDuplicates: true }
                      );
                      if (error) throw error;
                      toast.success("Enrolled! Course added to My Courses 🎉");
                      setEnrolledCourseIds(prev => new Set([...prev, course.id]));
                    } catch (err: any) {
                      toast.error(err.message || "Failed to enroll");
                    }
                  } : undefined}
                  onClick={() => {
                    if (course.price === 0 || isEnrolled) {
                      navigate(`/classes/${course.id}/chapters?from=courses`);
                    } else {
                      navigate(`/buy-course?id=${course.id}`);
                    }
                  }}
                />
              );
            })}
          </div>
        )}

        {!loading && filteredCourses.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No courses found for this grade.</p>
          </div>
        )}
      </main>
      
      <BottomNav />
    </div>
  );
};

export default Courses;
