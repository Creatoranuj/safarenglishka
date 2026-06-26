import { useState, useEffect, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

export interface Attendance {
  id: number;
  studentId: number;
  date: string;
  status: string;
  createdAt: string;
}

export interface AttendanceInput {
  studentId: number;
  date: string;
  status: 'present' | 'absent' | 'late';
}

export const useAttendance = (date?: string) => {
  const { isAdmin, isTeacher } = useAuth();
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase.from("attendance").select("*").order("created_at", { ascending: false });

      if (date) {
        query = query.eq("date", date);
      }

      const { data, error: dbError } = await query;
      if (dbError) throw dbError;

      const formatted: Attendance[] = (data || []).map((a: any) => ({
        id: a.id,
        studentId: a.student_id,
        date: a.date,
        status: a.status,
        createdAt: a.created_at,
      }));

      setAttendance(formatted);
    } catch (err: any) {
      console.error("Error fetching attendance:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  const fetchAttendanceByStudent = useCallback(async (studentId: number): Promise<Attendance[]> => {
    try {
      const { data, error: dbError } = await supabase
        .from("attendance")
        .select("*")
        .eq("student_id", studentId)
        .order("date", { ascending: false });

      if (dbError) throw dbError;

      return (data || []).map((a: any) => ({
        id: a.id,
        studentId: a.student_id,
        date: a.date,
        status: a.status,
        createdAt: a.created_at,
      }));
    } catch (err: any) {
      console.error("Error fetching student attendance:", err);
      return [];
    }
  }, []);

  const markAttendance = useCallback(async (input: AttendanceInput): Promise<boolean> => {
    if (!isAdmin && !isTeacher) {
      toast.error("Permission denied");
      return false;
    }

    try {
      const { error: dbError } = await supabase.from("attendance").insert({
        student_id: input.studentId,
        date: input.date,
        status: input.status,
      });

      if (dbError) throw dbError;

      toast.success("Attendance marked!");
      await fetchAttendance();
      return true;
    } catch (err: any) {
      console.error("Error marking attendance:", err);
      toast.error(err.message || "Failed to mark attendance");
      return false;
    }
  }, [isAdmin, isTeacher, fetchAttendance]);

  const bulkMarkAttendance = useCallback(async (records: AttendanceInput[]): Promise<boolean> => {
    if (!isAdmin && !isTeacher) {
      toast.error("Permission denied");
      return false;
    }

    try {
      const insertData = records.map(r => ({
        student_id: r.studentId,
        date: r.date,
        status: r.status,
      }));

      const { error: dbError } = await supabase.from("attendance").insert(insertData);
      if (dbError) throw dbError;

      toast.success("Bulk attendance saved!");
      await fetchAttendance();
      return true;
    } catch (err: any) {
      console.error("Error in bulk attendance:", err);
      toast.error("Failed to save some records");
      return false;
    }
  }, [isAdmin, isTeacher, fetchAttendance]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  return {
    attendance,
    loading,
    error,
    fetchAttendance,
    fetchAttendanceByStudent,
    markAttendance,
    bulkMarkAttendance,
  };
};
