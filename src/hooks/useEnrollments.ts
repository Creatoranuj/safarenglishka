import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { resolveContentUrl } from "../lib/resolveContentUrl";
import type { Course } from "./useCourses";
import { logger } from "@/lib/logger";


export interface Enrollment {
  id: number;
  userId: string;
  courseId: number;
  purchasedAt: string | null;
  status: string | null;
}

export interface EnrollmentWithCourse extends Enrollment {
  course?: Course;
}

export const useEnrollments = () => {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState<EnrollmentWithCourse[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // RELY-cleanup: prevent setState after unmount on slow networks.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const fetchEnrollments = useCallback(async () => {
    if (!user) {
      if (!aliveRef.current) return;
      setEnrollments([]);
      setEnrolledCourseIds([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: dbError } = await supabase
        .from("enrollments")
        .select("*, courses(*)")
        .eq("user_id", user.id);

      if (dbError) throw dbError;

      const formatted: EnrollmentWithCourse[] = await Promise.all(
        (data || []).map(async (e: any) => ({
          id: e.id,
          userId: e.user_id,
          courseId: e.course_id,
          purchasedAt: e.purchased_at,
          status: e.status,
          course: e.courses ? {
            id: e.courses.id,
            title: e.courses.title,
            description: e.courses.description,
            grade: e.courses.grade,
            price: e.courses.price,
            imageUrl: (await resolveContentUrl(e.courses.image_url)) ?? e.courses.image_url,
            thumbnailUrl: (await resolveContentUrl(e.courses.thumbnail_url)) ?? e.courses.thumbnail_url,
            createdAt: e.courses.created_at,
          } : undefined,
        }))
      );

      if (!aliveRef.current) return;
      setEnrollments(formatted);
      setEnrolledCourseIds(formatted.filter(e => e.status === 'active').map((e) => e.courseId));

    } catch (err: any) {
      logger.error("Error fetching enrollments:", err);
      if (aliveRef.current) setError(err.message);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [user]);

  const isEnrolled = useCallback((courseId: number): boolean => {
    return enrolledCourseIds.includes(courseId);
  }, [enrolledCourseIds]);

  const checkEnrollment = useCallback(async (courseId: number): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data } = await supabase
        .from("enrollments")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .eq("status", "active")
        .maybeSingle();

      return !!data;
    } catch (err: any) {
      logger.error("Error checking enrollment:", err);
      return false;
    }
  }, [user]);

  const enrollInCourse = useCallback(async (courseId: number): Promise<boolean> => {
    if (!user) {
      toast.error("Please login to enroll");
      return false;
    }

    try {
      const alreadyEnrolled = await checkEnrollment(courseId);
      if (alreadyEnrolled) {
        toast.info("You are already enrolled in this course");
        return true;
      }

      // Price gate: paid courses must go through Razorpay, not free-enroll RLS.
      const { data: course, error: priceErr } = await supabase
        .from("courses")
        .select("price")
        .eq("id", courseId)
        .maybeSingle();

      if (priceErr) throw priceErr;
      if (!course) {
        toast.error("Course not found");
        return false;
      }
      if ((course.price ?? 0) > 0) {
        toast.error("This is a paid course. Please complete payment to enroll.");
        return false;
      }

      const { error: dbError } = await supabase.from("enrollments").upsert(
        { user_id: user.id, course_id: courseId, status: 'active' },
        { onConflict: 'user_id,course_id', ignoreDuplicates: true }
      );

      if (dbError) throw dbError;

      toast.success("Successfully enrolled in course!");
      await fetchEnrollments();
      return true;
    } catch (err: any) {
      logger.error("Error enrolling in course:", err);
      toast.error(err.message || "Failed to enroll");
      return false;
    }
  }, [user, checkEnrollment, fetchEnrollments]);

  const cancelEnrollment = useCallback(async (enrollmentId: number): Promise<boolean> => {
    try {
      const { error: dbError } = await supabase
        .from("enrollments")
        .update({ status: 'cancelled' })
        .eq("id", enrollmentId);

      if (dbError) throw dbError;

      toast.success("Enrollment cancelled");
      await fetchEnrollments();
      return true;
    } catch (err: any) {
      logger.error("Error cancelling enrollment:", err);
      toast.error(err.message || "Failed to cancel enrollment");
      return false;
    }
  }, [fetchEnrollments]);

  const getEnrolledCourses = useCallback((): Course[] => {
    return enrollments
      .filter((e) => e.course)
      .map((e) => e.course!);
  }, [enrollments]);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  return {
    enrollments,
    enrolledCourseIds,
    loading,
    error,
    fetchEnrollments,
    isEnrolled,
    checkEnrollment,
    enrollInCourse,
    cancelEnrollment,
    getEnrolledCourses,
  };
};
