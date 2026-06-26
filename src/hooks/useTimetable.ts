import { useState, useEffect, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

export interface TimetableEntry {
  id: string;
  courseId: number | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  teacherId: string | null;
  createdAt: string;
}

export interface TimetableEntryWithCourse extends TimetableEntry {
  course?: {
    title: string;
    grade: string | null;
  };
}

export interface TimetableInput {
  courseId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  teacherId?: string;
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const useTimetable = () => {
  const { user, isAdmin, isTeacher } = useAuth();
  const [timetable, setTimetable] = useState<TimetableEntryWithCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimetable = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: dbError } = await supabase
        .from("timetable")
        .select("*, courses:course_id (title, grade)")
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true });

      if (dbError) throw dbError;

      const formatted: TimetableEntryWithCourse[] = (data || []).map((t: any) => ({
        id: t.id,
        courseId: t.course_id,
        dayOfWeek: t.day_of_week,
        startTime: t.start_time,
        endTime: t.end_time,
        room: t.room,
        teacherId: t.teacher_id,
        createdAt: t.created_at,
        course: t.courses ? { title: t.courses.title, grade: t.courses.grade } : undefined,
      }));

      setTimetable(formatted);
    } catch (err: any) {
      console.error("Error fetching timetable:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const getTimetableByDay = useCallback((dayOfWeek: number): TimetableEntryWithCourse[] => {
    return timetable.filter(entry => entry.dayOfWeek === dayOfWeek);
  }, [timetable]);

  const getTodaySchedule = useCallback((): TimetableEntryWithCourse[] => {
    const today = new Date().getDay();
    return getTimetableByDay(today);
  }, [getTimetableByDay]);

  const createEntry = useCallback(async (input: TimetableInput): Promise<boolean> => {
    if (!user || (!isAdmin && !isTeacher)) {
      toast.error("You don't have permission to modify timetable");
      return false;
    }

    try {
      const { error: dbError } = await supabase.from("timetable").insert({
        course_id: input.courseId,
        day_of_week: input.dayOfWeek,
        start_time: input.startTime,
        end_time: input.endTime,
        room: input.room || null,
        teacher_id: input.teacherId || null,
      });

      if (dbError) throw dbError;

      toast.success("Schedule entry added!");
      await fetchTimetable();
      return true;
    } catch (err: any) {
      console.error("Error creating timetable entry:", err);
      toast.error(err.message || "Failed to add entry");
      return false;
    }
  }, [user, isAdmin, isTeacher, fetchTimetable]);

  const updateEntry = useCallback(async (id: string, input: Partial<TimetableInput>): Promise<boolean> => {
    try {
      const updateData: any = {};
      if (input.courseId !== undefined) updateData.course_id = input.courseId;
      if (input.dayOfWeek !== undefined) updateData.day_of_week = input.dayOfWeek;
      if (input.startTime !== undefined) updateData.start_time = input.startTime;
      if (input.endTime !== undefined) updateData.end_time = input.endTime;
      if (input.room !== undefined) updateData.room = input.room;
      if (input.teacherId !== undefined) updateData.teacher_id = input.teacherId;

      const { error: dbError } = await supabase
        .from("timetable")
        .update(updateData)
        .eq("id", id);

      if (dbError) throw dbError;

      toast.success("Schedule updated!");
      await fetchTimetable();
      return true;
    } catch (err: any) {
      console.error("Error updating timetable entry:", err);
      toast.error(err.message || "Failed to update entry");
      return false;
    }
  }, [fetchTimetable]);

  const deleteEntry = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error: dbError } = await supabase
        .from("timetable")
        .delete()
        .eq("id", id);

      if (dbError) throw dbError;

      toast.success("Schedule entry removed!");
      await fetchTimetable();
      return true;
    } catch (err: any) {
      console.error("Error deleting timetable entry:", err);
      toast.error(err.message || "Failed to delete entry");
      return false;
    }
  }, [fetchTimetable]);

  useEffect(() => {
    fetchTimetable();
  }, [fetchTimetable]);

  return {
    timetable,
    loading,
    error,
    fetchTimetable,
    getTimetableByDay,
    getTodaySchedule,
    createEntry,
    updateEntry,
    deleteEntry,
    DAY_NAMES,
  };
};
