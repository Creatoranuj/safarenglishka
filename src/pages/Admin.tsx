import { useState, useEffect, useMemo, useRef } from "react";
import { reportError } from "@/lib/sentry";
import { useNavigate, useSearchParams } from "react-router-dom";
import { openResource } from "@/lib/openResource";
import { supabase } from "../integrations/supabase/client";
// detectFileType / fileTypeOptions / MaterialFileType moved into LibraryManager
// where they are now the only consumers. Removed from Admin.tsx to drop dead
// imports after the library tab extraction.
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ScrollArea } from "../components/ui/scroll-area";
import { Textarea } from "../components/ui/textarea";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import {
  Upload, Users, CheckCircle, XCircle, Clock,
  Trash2, Plus, BookOpen, ExternalLink, ShieldAlert, Search,
  Download, Filter, RefreshCw, Eye, IndianRupee, Loader2, Library, Calendar,
  GraduationCap, UserCheck, UserX, Radio, ImageIcon, MessageSquare, Monitor, Smartphone, LogOut,
  FileText, Link as LinkIcon,
} from "lucide-react";

import ContentDrillDown from "../components/admin/ContentDrillDown";
import SocialLinksManager from "../components/admin/SocialLinksManager";
import HeroBannerManager from "../components/admin/HeroBannerManager";
import LandingCoursesManager from "../components/admin/LandingCoursesManager";
import TestimonialsManager from "../components/admin/TestimonialsManager";
import SyllabusManager from "../components/admin/SyllabusManager";
import TimetableManager from "../components/admin/TimetableManager";
import EnrollmentManager from "../components/admin/EnrollmentManager";
import LibraryManager from "../components/admin/LibraryManager";

interface UserWithRole {
  id: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  created_at: string | null;
  role: string | null;
}

// EnrollmentManager extracted to src/components/admin/EnrollmentManager.tsx
// (memoized, lazy-mountable, easier to test).


const Admin = () => {
  const confirmAction = useConfirm();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const activeTab = searchParams.get("tab") || "courses";
  const setActiveTab = (tab: string) => setSearchParams({ tab }, { replace: true });

  // Auto-center the active tab in the horizontally scrolling TabsList so its
  // label is never clipped at the edges.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-admin-tabs] [data-tab="${activeTab}"]`);
      el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
    return () => cancelAnimationFrame(raf);
  }, [activeTab]);

  // -- DATA STATES --
  const [payments, setPayments] = useState<any[]>([]);
  const [razorpayPayments, setRazorpayPayments] = useState<any[]>([]);
  const [coursesList, setCoursesList] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [roleChanging, setRoleChanging] = useState<Record<string, boolean>>({});
  const [statsData, setStatsData] = useState({
    totalStudents: 0,
    totalCourses: 0,
    pendingPayments: 0,
    activeEnrollments: 0,
    totalRevenue: 0,
    activeSessions: 0,
  });

  // -- SESSIONS STATE --
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [terminatingSession, setTerminatingSession] = useState<string | null>(null);

  // -- SEARCH & FILTER STATES --
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<"pending" | "approved" | "rejected" | "completed" | "refunded" | "all">("all");
  const [refundingPayment, setRefundingPayment] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | "student" | "teacher" | "admin">("all");
  const [teacherSearch, setTeacherSearch] = useState("");

  // -- COURSE CREATION STATE --
  const [newCourse, setNewCourse] = useState({ title: "", description: "", price: "", grade: "", startDate: "", endDate: "" });
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [courseThumbnailUrl, setCourseThumbnailUrl] = useState("");
  const [courseThumbnailMode, setCourseThumbnailMode] = useState<"file" | "url">("file");

  // -- INLINE EDIT: Course --
  const [editingCourseId, setEditingCourseId] = useState<number | null>(null);
  const [editCourseData, setEditCourseData] = useState({ title: "", description: "", price: "", grade: "", startDate: "", endDate: "" });
  const [editThumbnailFile, setEditThumbnailFile] = useState<File | null>(null);
  const [editThumbnailUrl, setEditThumbnailUrl] = useState("");
  const [editThumbnailMode, setEditThumbnailMode] = useState<"file" | "url">("file");

  // -- LIBRARY STATE moved into <LibraryManager /> (src/components/admin/LibraryManager.tsx).
  // It owns its 13 local state slices + 7 handlers + fetchLibraryData side-effect.
  // Admin only passes `coursesList` so the memoized child won't re-render on tab switches.

  // Admin access protection
  useEffect(() => {
    if (!authLoading && !user) {
      toast.error("Please login to access admin panel");
      navigate("/admin/login");
    } else if (!authLoading && user && !isAdmin) {
      toast.error("Access denied. Admin privileges required.");
      navigate("/dashboard");
    }
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (user && isAdmin) fetchDashboardData();
  }, [user, isAdmin]);

  // --- FETCH DATA ---
  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const { data: coursesData } = await supabase.from('courses').select('*');
      if (coursesData) setCoursesList(coursesData);

      let paymentQuery = supabase
        .from('payment_requests')
        .select(`*, courses (title), profiles (full_name, email)`)
        .order('created_at', { ascending: false });
      // Always fetch all statuses — client-side memo handles filtering
      const { data: payData } = await paymentQuery;
      if (payData) setPayments(payData);

      const { data: rzpData } = await supabase
        .from('razorpay_payments')
        .select(`*, courses (title), profiles (full_name, email)`)
        .order('created_at', { ascending: false });
      if (rzpData) setRazorpayPayments(rzpData);

      const { data: profilesData } = await supabase.from('profiles').select('*');
      const { data: rolesData } = await supabase.from('user_roles').select('user_id, role');
      if (profilesData) {
        const usersWithRoles: UserWithRole[] = profilesData.map(profile => ({
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
          mobile: profile.mobile,
          created_at: profile.created_at,
          role: rolesData?.find(r => r.user_id === profile.id)?.role || null
        }));
        setUsersList(usersWithRoles);
      }

      const { count: studentCount } = await supabase.from('user_roles').select('*', { count: 'exact', head: true }).eq('role', 'student');
      const { count: enrollCount } = await supabase.from('enrollments').select('*', { count: 'exact', head: true });
      const { count: pendingCount } = await supabase.from('payment_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending');

      const { data: approvedPayments } = await supabase.from('payment_requests').select('amount').eq('status', 'approved');
      const { data: completedRzp } = await supabase.from('razorpay_payments').select('amount').eq('status', 'completed');
      const manualRevenue = approvedPayments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      const rzpRevenue = completedRzp?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

      // LibraryManager fetches its own data on mount; no eager fetch needed here.

      const { count: sessionsCount } = await supabase
        .from("user_sessions")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      setStatsData({
        totalStudents: studentCount || 0,
        totalCourses: coursesData?.length || 0,
        pendingPayments: pendingCount || 0,
        activeEnrollments: enrollCount || 0,
        totalRevenue: manualRevenue + rzpRevenue,
        activeSessions: sessionsCount || 0,
      });
    } catch (error) {
      reportError(error, { surface: "Admin.fetch" });
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  // --- ROLE MANAGEMENT ---
  const handleChangeRole = async (userId: string, newRole: string) => {
    setRoleChanging(prev => ({ ...prev, [userId]: true }));
    try {
      const { error: delError } = await supabase.from('user_roles').delete().eq('user_id', userId);
      if (delError) throw delError;
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: newRole as "admin" | "teacher" | "student" });
      if (error) throw error;
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      toast.success("Role updated successfully");
    } catch (err: any) {
      toast.error("Failed to update role: " + (err?.message || "Unknown error"));
    } finally {
      setRoleChanging(prev => ({ ...prev, [userId]: false }));
    }
  };

  // --- FILTERED DATA ---
  const allPaymentsUnified = useMemo(() => {
    const manual = payments.map(p => ({
      ...p, _method: 'upi' as const, _key: `upi-${p.id}`,
      _displayName: p.profiles?.full_name || p.sender_name || p.user_name || 'Unknown',
      _email: p.profiles?.email || '', _course: p.courses?.title || 'Unknown Course',
      _amount: p.amount, _status: p.status, _date: p.created_at,
    }));
    const rzp = razorpayPayments.map(p => ({
      ...p, _method: 'razorpay' as const, _key: `rzp-${p.id}`,
      _displayName: p.profiles?.full_name || 'Online Payment',
      _email: p.profiles?.email || '', _course: p.courses?.title || 'Unknown Course',
      _amount: p.amount, _status: p.status, _date: p.created_at,
    }));
    return [...manual, ...rzp].sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime());
  }, [payments, razorpayPayments]);

  const filteredPayments = useMemo(() => {
    const s = paymentSearch.toLowerCase();
    return allPaymentsUnified.filter(p => {
      const matchesSearch = !s || p._displayName.toLowerCase().includes(s) || p._email.toLowerCase().includes(s) ||
        p._course.toLowerCase().includes(s) || (p.transaction_id?.toLowerCase().includes(s)) || (p.razorpay_payment_id?.toLowerCase().includes(s));
      const matchesStatus = paymentStatusFilter === "all" || p._status === paymentStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [allPaymentsUnified, paymentSearch, paymentStatusFilter]);

  const filteredCourses = useMemo(() =>
    coursesList.filter(c => c.title?.toLowerCase().includes(courseSearch.toLowerCase()) || c.grade?.toLowerCase().includes(courseSearch.toLowerCase())),
  [coursesList, courseSearch]);

  const filteredUsers = useMemo(() =>
    usersList.filter(u => {
      const matchesSearch = u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase()) || u.mobile?.toLowerCase().includes(userSearch.toLowerCase());
      const matchesRole = userRoleFilter === "all" || u.role === userRoleFilter;
      return matchesSearch && matchesRole;
    }),
  [usersList, userSearch, userRoleFilter]);

  const activeTeachers = useMemo(() => usersList.filter(u => u.role === 'teacher'), [usersList]);
  const promotableStudents = useMemo(() =>
    usersList.filter(u => (u.role === 'student' || !u.role) &&
      (u.full_name?.toLowerCase().includes(teacherSearch.toLowerCase()) || u.email?.toLowerCase().includes(teacherSearch.toLowerCase()))
    ),
  [usersList, teacherSearch]);

  // --- EXPORT ---
  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) { toast.error("No data to export"); return; }
    const headers = Object.keys(data[0]).filter(k => !k.includes('id') && typeof data[0][k] !== 'object');
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h];
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
        return val ?? '';
      }).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success(`Exported ${data.length} records`);
  };

  // --- PAYMENT ACTIONS ---
  // SECURITY: Verify amount >= course price client-side (DB trigger is the
  // real enforcer — this just gives the admin a clear UX warning). Enroll
  // FIRST, then mark approved, so we never end up with status=approved but
  // no enrollment row if the second write fails. Idempotent.
  const handleApprovePayment = async (paymentRequest: any) => {
    if (paymentRequest.status === 'approved') {
      toast.info("Already approved.");
      return;
    }
    // Re-fetch course price at approval time (price could have changed).
    const { data: course, error: courseErr } = await supabase
      .from('courses').select('price, title').eq('id', paymentRequest.course_id).maybeSingle();
    if (courseErr || !course) {
      toast.error("Could not load course for verification.");
      return;
    }
    const expected = Number(course.price || 0);
    const claimed = Number(paymentRequest.amount || 0);
    if (expected === 0) {
      toast.error("This is a free course — manual payment should not be approved.");
      return;
    }
    if (claimed < expected) {
      toast.error(`Amount mismatch: paid ₹${claimed} but course costs ₹${expected}. Reject or ask user to repay.`);
      return;
    }
    const confirmMsg = claimed > expected
      ? `Approve ₹${claimed} for "${course.title}" (₹${expected})? User overpaid by ₹${claimed - expected}.`
      : `Approve payment of ₹${claimed} for "${course.title}" by ${paymentRequest.sender_name}?`;
    if (!(await confirmAction({ title: confirmMsg, variant: "destructive" }))) return;

    try {
      // 1. Enroll first (idempotent via onConflict).
      const { error: enrollError } = await supabase.from('enrollments')
        .upsert(
          { user_id: paymentRequest.user_id, course_id: paymentRequest.course_id, status: 'active' },
          { onConflict: 'user_id,course_id', ignoreDuplicates: true }
        );
      if (enrollError) throw enrollError;

      // 2. Then mark request approved (trigger stamps approved_by/approved_at).
      const { error: updateError } = await supabase
        .from('payment_requests')
        .update({ status: 'approved' })
        .eq('id', paymentRequest.id)
        .eq('status', 'pending'); // optimistic-concurrency: only if still pending
      if (updateError) throw updateError;

      toast.success("Payment Approved & Course Unlocked!");
      fetchDashboardData();
    } catch (error: any) {
      toast.error("Approval Error: " + error.message);
    }
  };

  const handleRejectPayment = async (paymentId: number) => {
    if (!(await confirmAction({ title: "Are you sure you want to REJECT this payment?", variant: "destructive" }))) return;
    try {
      const { error } = await supabase
        .from('payment_requests')
        .update({ status: 'rejected' })
        .eq('id', paymentId)
        .eq('status', 'pending'); // don't overwrite already-actioned rows
      if (error) throw error;
      toast.error("Payment request rejected.");
      fetchDashboardData();
    } catch (error: any) {
      toast.error("Error rejecting: " + error.message);
    }
  };

  // --- REFUND CONFIRMATION DIALOG STATE ---
  const [refundConfirmPayment, setRefundConfirmPayment] = useState<any>(null);
  const [refundConfirmText, setRefundConfirmText] = useState("");

  const openRefundDialog = (payment: any) => {
    setRefundConfirmPayment(payment);
    setRefundConfirmText("");
  };

  const handleInitiateRefund = async () => {
    const payment = refundConfirmPayment;
    if (!payment) return;
    setRefundConfirmPayment(null);
    setRefundConfirmText("");
    setRefundingPayment(payment._key);
    try {
      // supabase.functions.invoke — works in native APK without the dev proxy.
      const { data, error } = await supabase.functions.invoke("initiate-refund", {
        body: { razorpay_payment_id: payment.razorpay_payment_id, razorpay_order_id: payment.razorpay_order_id },
      });
      if (error) throw new Error(error.message || "Refund failed");
      if (!data?.success) throw new Error(data?.error || 'Refund failed');
      toast.success('Refund initiated! Course access revoked.');
      fetchDashboardData();
    } catch (err: any) {
      toast.error('Refund failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setRefundingPayment(null);
    }
  };


  const handleCreateCourse = async () => {
    if (!newCourse.title || !newCourse.price || !newCourse.grade) return toast.error("Fill all fields");
    try {
      setIsCreatingCourse(true);
      let thumbnailUrl = "https://placehold.co/600x400/png";
      if (courseThumbnailMode === "url" && courseThumbnailUrl.trim()) {
        thumbnailUrl = courseThumbnailUrl.trim();
      } else if (thumbnailFile) {
        const fileExt = thumbnailFile.name.split('.').pop();
        const fileName = `course_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('content').upload(`thumbnails/${fileName}`, thumbnailFile, {
          cacheControl: '31536000',
          contentType: thumbnailFile.type,
          upsert: false,
        });
        if (uploadError) throw uploadError;
        thumbnailUrl = `storage://content/thumbnails/${fileName}`;

      }
      const { error } = await supabase.from('courses').insert({
        title: newCourse.title, description: newCourse.description, price: parseFloat(newCourse.price),
        grade: newCourse.grade, image_url: thumbnailUrl, thumbnail_url: thumbnailUrl,
        start_date: newCourse.startDate || null,
        end_date: newCourse.endDate || null,
      });
      if (error) throw error;
      toast.success("Course Created!");
      setNewCourse({ title: "", description: "", price: "", grade: "", startDate: "", endDate: "" });
      setThumbnailFile(null);
      setCourseThumbnailUrl("");
      setCourseThumbnailMode("file");
      fetchDashboardData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsCreatingCourse(false);
    }
  };

  const handleDeleteCourse = async (id: number) => {
    if (!(await confirmAction({ title: "Delete course? This will remove all lessons too!", variant: "destructive" }))) return;
    const { error } = await supabase.from('courses').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success("Course deleted"); fetchDashboardData(); }
  };

  const handleEditCourse = (course: any) => {
    setEditingCourseId(course.id);
    setEditCourseData({ title: course.title || "", description: course.description || "", price: String(course.price || ""), grade: course.grade || "", startDate: course.start_date || "", endDate: course.end_date || "" });
    setEditThumbnailFile(null);
    setEditThumbnailUrl(course.thumbnail_url || course.image_url || "");
    setEditThumbnailMode("file");
  };

  const handleSaveCourseEdit = async () => {
    if (!editingCourseId) return;
    let thumbnailUrl: string | undefined;
    if (editThumbnailMode === "url") {
      thumbnailUrl = editThumbnailUrl.trim() || undefined;
    } else if (editThumbnailFile) {
      const fileExt = editThumbnailFile.name.split('.').pop();
      const fileName = `course_${editingCourseId}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('content').upload(`thumbnails/${fileName}`, editThumbnailFile, {
        cacheControl: '31536000',
        contentType: editThumbnailFile.type,
        upsert: false,
      });
      if (uploadError) { toast.error(uploadError.message); return; }
      thumbnailUrl = `storage://content/thumbnails/${fileName}`;

    }
    const updateData: any = { title: editCourseData.title, description: editCourseData.description, price: parseFloat(editCourseData.price) || 0, grade: editCourseData.grade, start_date: editCourseData.startDate || null, end_date: editCourseData.endDate || null };
    if (thumbnailUrl) { updateData.image_url = thumbnailUrl; updateData.thumbnail_url = thumbnailUrl; }
    const { error } = await supabase.from('courses').update(updateData).eq('id', editingCourseId);
    if (error) toast.error(error.message);
    else { toast.success("Course updated!"); setEditingCourseId(null); setEditThumbnailFile(null); setEditThumbnailUrl(""); setEditThumbnailMode("file"); fetchDashboardData(); }
  };

  // --- Library & Notes CRUD moved into <LibraryManager />.
  // fetchLibraryData / filteredLibraryLessons / handleCreateMaterial /
  // handleDeleteMaterial / handleSaveMaterialEdit / handleCreateNote /
  // handleDeleteNote / handleSaveNoteEdit all live there now. Admin keeps
  // a slimmer surface and `LibraryManager` can be `React.memo`-skipped on
  // every non-library tab switch.

  // --- Sessions ---
  const fetchSessionsData = async () => {
    setSessionsLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("id, user_id, device_type, user_agent, last_active_at, logged_in_at, is_active")
        .eq("is_active", true).order("last_active_at", { ascending: false });
      if (!error && data) setSessionsList(data);
    } finally { setSessionsLoading(false); }
  };

  const handleForceLogout = async (sessionToken: string, targetUserId: string) => {
    if (!(await confirmAction({ title: "Force logout this session?", variant: "destructive" }))) return;
    setTerminatingSession(sessionToken);
    try {
      const { error } = await supabase.functions.invoke("manage-session", {
        body: { action: "terminate", session_id: sessionToken },
      });
      if (!error) {
        toast.success("Session terminated");
        setSessionsList(prev => prev.filter(s => s.id !== sessionToken));
        setStatsData(prev => ({ ...prev, activeSessions: Math.max(0, prev.activeSessions - 1) }));
      } else toast.error("Failed to terminate session");
    } finally { setTerminatingSession(null); }
  };

  // --- UI Helpers ---
  const stats = [
    { label: "Total Students", value: statsData.totalStudents, icon: Users, color: "text-blue-600 bg-blue-100", tab: "users" },
    { label: "Total Revenue", value: `₹${statsData.totalRevenue.toLocaleString()}`, icon: IndianRupee, color: "text-emerald-600 bg-emerald-100", tab: "payments" },
    { label: "Total Courses", value: statsData.totalCourses, icon: BookOpen, color: "text-green-600 bg-green-100", tab: "courses" },
    { label: "Pending Payments", value: statsData.pendingPayments, icon: Clock, color: "text-orange-600 bg-orange-100", tab: "payments" },
    { label: "Active Sessions", value: statsData.activeSessions, icon: Monitor, color: "text-cyan-600 bg-cyan-100", tab: "sessions" },
  ];

  const getRoleBadge = (role: string | null) => {
    switch (role) {
      case 'admin': return <Badge className="bg-red-100 text-red-700 border-red-200">Admin</Badge>;
      case 'teacher': return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Teacher</Badge>;
      case 'student': return <Badge className="bg-green-100 text-green-700 border-green-200">Student</Badge>;
      default: return <Badge className="bg-gray-100 text-gray-700 border-gray-200">No Role</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-green-100 text-green-700 border-green-200">Approved</Badge>;
      case 'completed': return <Badge className="bg-green-100 text-green-700 border-green-200">Completed</Badge>;
      case 'rejected': return <Badge className="bg-red-100 text-red-700 border-red-200">Rejected</Badge>;
      case 'failed': return <Badge className="bg-red-100 text-red-700 border-red-200">Failed</Badge>;
      case 'refunded': return <Badge className="bg-purple-100 text-purple-700 border-purple-200">Refunded ↩</Badge>;
      default: return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Pending</Badge>;
    }
  };

  // Loading state
  const [loadTimeout, setLoadTimeout] = useState(false);
  useEffect(() => {
    if (authLoading) {
      const timer = setTimeout(() => setLoadTimeout(true), 8000);
      return () => clearTimeout(timer);
    } else setLoadTimeout(false);
  }, [authLoading]);

  if (authLoading) {
    return (
    <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">{loadTimeout ? "Taking longer than expected..." : "Loading..."}</p>
          {loadTimeout && <button onClick={() => window.location.reload()} className="mt-4 text-primary hover:underline text-sm font-medium">Refresh Page</button>}
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <ShieldAlert className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-6">You need admin privileges to access this page.</p>
            <Button onClick={() => navigate("/admin/login")} className="w-full">Go to Admin Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      <main className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6 pb-20 md:pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-3xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Manage your academy operations.</p>
          </div>
          <Button variant="outline" onClick={fetchDashboardData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className={`border-none shadow-sm ${stat.tab ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
              onClick={() => { if (stat.tab) setActiveTab(stat.tab); }}>
              <CardContent className="p-2 md:p-4 flex items-center gap-1.5 md:gap-4 min-w-0">
                <div className={`p-1.5 md:p-3 rounded-md md:rounded-xl shrink-0 ${stat.color}`}>
                  <stat.icon className="h-3.5 w-3.5 md:h-6 md:w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-base md:text-2xl font-bold text-foreground leading-tight">{stat.value}</p>
                  <p className="text-[10px] md:text-sm text-muted-foreground font-medium truncate">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* TABS */}
        {/*
          PERF — Heavy <TabsContent> bodies (payments / users / teachers /
          courses / library / sessions) are wrapped in
          `{activeTab === 'X' && (<>...</>)}` below. Radix Tabs otherwise
          mounts every TabsContent child up-front (just display:none), which
          on this 1600-LOC admin page caused 12+ unused useEffects to fire
          and slowed first-paint on low-end Android. The fragment guard
          keeps inactive tabs unmounted until selected. Don't "clean up" by
          removing the guard.
        */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === 'sessions') fetchSessionsData(); }} className="w-full space-y-6">
        {/* Library tab no longer needs an eager fetch here — LibraryManager
            fetches itself on mount, and mount-on-demand (`activeTab === 'library'`)
            guarantees a fresh fetch every time the operator opens the tab. */}
          {/* Mobile-friendly horizontal chip row.
              Previous attempts stacked absolute edge-fades on top of the
              scroller. On a 390px viewport the fades visually "ate" the
              first/last chips (Doubts / Banners were half-hidden and looked
              cut off, which is what the user kept reporting). Removed the
              fades entirely — a `scrollbar-hide` overflow scroller with
              `snap-x` behaves natively on Android/iOS and the border of the
              chip container itself is a clear affordance that the row
              scrolls. `pl-2 pr-2` keeps the first/last chip comfortably
              inside the border without any overlay. */}
          <div className="relative w-full max-w-full overflow-hidden rounded-lg border bg-card">
            <TabsList
              className="bg-transparent border-0 rounded-none w-full overflow-x-auto scrollbar-hide flex flex-nowrap h-auto gap-1 p-1 snap-x snap-proximity scroll-px-2"
              data-admin-tabs=""
            >
            <TabsTrigger data-tab="courses" value="courses" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1 gap-1"><BookOpen className="h-4 w-4" />Courses</TabsTrigger>
            <TabsTrigger data-tab="live" value="live" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1 gap-1 text-destructive data-[state=active]:text-destructive"><Radio className="h-4 w-4" />Live</TabsTrigger>
            <TabsTrigger data-tab="payments" value="payments" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1 gap-1">Payments <Badge variant="destructive" className="ml-1">{statsData.pendingPayments}</Badge></TabsTrigger>
            <TabsTrigger data-tab="users" value="users" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1">Users</TabsTrigger>
            <TabsTrigger data-tab="teachers" value="teachers" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1 gap-1"><GraduationCap className="h-4 w-4" />Teachers</TabsTrigger>
            <TabsTrigger data-tab="library" value="library" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1 gap-1"><Library className="h-4 w-4" />Library</TabsTrigger>
            <TabsTrigger data-tab="doubts" value="doubts" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1 gap-1"><MessageSquare className="h-4 w-4" />Doubts</TabsTrigger>
            <TabsTrigger data-tab="content" value="content" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1 gap-1 text-primary data-[state=active]:text-primary font-semibold"><Upload className="h-4 w-4" />Upload</TabsTrigger>
            <TabsTrigger data-tab="schedule" value="schedule" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1 gap-1"><Calendar className="h-4 w-4" />Schedule</TabsTrigger>
            <TabsTrigger data-tab="enrollments" value="enrollments" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1 gap-1"><UserCheck className="h-4 w-4" />Enrollments</TabsTrigger>
            <TabsTrigger data-tab="banners" value="banners" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1 gap-1"><ImageIcon className="h-4 w-4" />Banners</TabsTrigger>
            <TabsTrigger data-tab="landing-courses" value="landing-courses" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1 gap-1"><BookOpen className="h-4 w-4" />Landing</TabsTrigger>
            <TabsTrigger data-tab="testimonials" value="testimonials" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1 gap-1"><MessageSquare className="h-4 w-4" />Reviews</TabsTrigger>
            <TabsTrigger data-tab="social" value="social" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1 gap-1"><ExternalLink className="h-4 w-4" />Social</TabsTrigger>
            <TabsTrigger data-tab="sessions" value="sessions" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1 gap-1"><Monitor className="h-4 w-4" />Sessions</TabsTrigger>
            <TabsTrigger data-tab="syllabus" value="syllabus" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1 gap-1"><FileText className="h-4 w-4" />Syllabus</TabsTrigger>
            <TabsTrigger data-tab="timetable" value="timetable" className="py-2 min-h-[44px] shrink-0 snap-start scroll-mx-1 gap-1"><Clock className="h-4 w-4" />Timetable</TabsTrigger>
          </TabsList>
          </div>




          {/* PAYMENTS TAB */}
          <TabsContent value="payments">{activeTab === 'payments' && (<>
            {(() => {
              const now = new Date();
              const todayStr = now.toISOString().split('T')[0];
              const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
              const completedRzp = razorpayPayments.filter(p => p.status === 'completed');
              const approvedManual = payments.filter(p => p.status === 'approved');
              const todayRzp = completedRzp.filter(p => p.created_at?.startsWith(todayStr)).reduce((s: number, p: any) => s + (p.amount || 0), 0);
              const todayManual = approvedManual.filter(p => p.created_at?.startsWith(todayStr)).reduce((s: number, p: any) => s + (p.amount || 0), 0);
              const monthRzp = completedRzp.filter(p => p.created_at >= monthStart).reduce((s: number, p: any) => s + (p.amount || 0), 0);
              const monthManual = approvedManual.filter(p => p.created_at >= monthStart).reduce((s: number, p: any) => s + (p.amount || 0), 0);
              return (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                  <Card className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Revenue</p>
                    <p className="text-xl font-bold text-primary">₹{statsData.totalRevenue.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">All Time</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Today</p>
                    <p className="text-xl font-bold text-emerald-600">₹{(todayRzp + todayManual).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{completedRzp.filter(p => p.created_at?.startsWith(todayStr)).length + approvedManual.filter(p => p.created_at?.startsWith(todayStr)).length} txns</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">This Month</p>
                    <p className="text-xl font-bold text-blue-600">₹{(monthRzp + monthManual).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{completedRzp.filter(p => p.created_at >= monthStart).length + approvedManual.filter(p => p.created_at >= monthStart).length} txns</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Manual UPI</p>
                    <p className="text-xl font-bold">₹{approvedManual.reduce((s: number, p: any) => s + (p.amount || 0), 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{approvedManual.length} approved</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Razorpay</p>
                    <p className="text-xl font-bold">₹{completedRzp.reduce((s: number, p: any) => s + (p.amount || 0), 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{completedRzp.length} completed</p>
                  </Card>
                </div>
              );
            })()}
            <Card className="border shadow-sm">
              <CardHeader className="bg-orange-50/50 border-b pb-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <CardTitle className="flex items-center gap-2 text-orange-700">
                    <ShieldAlert className="h-5 w-5" /> All Payments ({filteredPayments.length})
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Search name, UTR, course..." value={paymentSearch} onChange={(e) => setPaymentSearch(e.target.value)} className="pl-9" />
                    </div>
                    <Select value={paymentStatusFilter} onValueChange={(v: any) => setPaymentStatusFilter(v)}>
                      <SelectTrigger className="w-[130px]"><Filter className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="refunded">Refunded</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => exportToCSV(filteredPayments.map(p => ({
                      method: p._method === 'razorpay' ? 'Razorpay' : 'UPI Manual',
                      name: p._displayName, course: p._course, amount: p._amount, status: p._status, date: p._date,
                      ref: p.transaction_id || p.razorpay_payment_id || '',
                    })), 'payments')}>
                      <Download className="h-4 w-4 mr-1" /> Export
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  {filteredPayments.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3 opacity-20" />
                      <p className="text-muted-foreground">No payments found.</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredPayments.map((req) => (
                        <div key={req._key} className="p-4 md:p-5 hover:bg-muted/30 transition-colors flex flex-col md:flex-row gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-bold text-foreground">{req._course}</h3>
                                  {getStatusBadge(req._status)}
                                  <Badge variant={req._method === 'razorpay' ? 'default' : 'outline'} className="text-xs">
                                    {req._method === 'razorpay' ? '💳 Razorpay' : '📱 UPI Manual'}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {req._method === 'razorpay' ? `Order: ${req.razorpay_order_id?.slice(-8) || '—'}` : `${req._displayName} · ${req._email || '—'}`}
                                </p>
                              </div>
                              <Badge variant="outline" className="text-base px-3 py-1 shrink-0">₹{req._amount}</Badge>
                            </div>
                            {req._method === 'upi' && (
                              <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg text-xs space-y-1 border border-blue-100 dark:border-blue-900">
                                <p className="flex justify-between"><span className="text-blue-600 font-medium">Sender:</span><span className="font-bold">{req.sender_name || '—'}</span></p>
                                <p className="flex justify-between"><span className="text-blue-600 font-medium">UTR:</span><span className="font-mono font-bold">{req.transaction_id || '—'}</span></p>
                              </div>
                            )}
                            {req._method === 'razorpay' && req.razorpay_payment_id && (
                              <div className="bg-primary/5 p-2 rounded-lg text-xs border border-primary/10">
                                <p>Payment ID: <span className="font-mono">{req.razorpay_payment_id}</span></p>
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground">{new Date(req._date).toLocaleString('en-IN')}</p>
                          </div>
                          {req._method === 'upi' && (
                            <div className="flex flex-col gap-2 min-w-[180px]">
                              {req.screenshot_url && (
                                <a href="#" onClick={async (e) => {
                                  e.preventDefault();
                                  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(req.screenshot_url, 3600);
                                  if (data?.signedUrl) await openResource({ url: data.signedUrl, kind: "image" });
                                  else if (error) toast.error('Could not load screenshot');
                                }}>
                                  <Button variant="outline" className="w-full" size="sm"><Eye className="h-4 w-4 mr-2" />View Screenshot</Button>
                                </a>
                              )}
                              {req._status === 'pending' && (
                                <div className="flex gap-2">
                                  <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApprovePayment(req)}>
                                    <CheckCircle className="h-4 w-4 mr-1" />Approve
                                  </Button>
                                  <Button size="sm" variant="destructive" className="flex-1" onClick={() => handleRejectPayment(req.id)}>
                                    <XCircle className="h-4 w-4 mr-1" />Reject
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                          {req._method === 'razorpay' && req._status === 'completed' && req.razorpay_payment_id && (
                            <div className="flex flex-col gap-2 min-w-[180px]">
                              <Button 
                                size="sm" 
                                variant="destructive" 
                                className="w-full"
                                disabled={refundingPayment === req._key}
                                onClick={() => openRefundDialog(req)}
                              >
                                {refundingPayment === req._key ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                                Refund
                              </Button>
                            </div>
                          )}

                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </>)}</TabsContent>

          {/* USERS TAB */}
          <TabsContent value="users">{activeTab === 'users' && (<>
            <Card className="border shadow-sm">
              <CardHeader className="bg-blue-50/50 border-b pb-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <CardTitle className="flex items-center gap-2 text-blue-700">
                    <Users className="h-5 w-5" /> Registered Users ({usersList.length})
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Search by name, email, phone..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="pl-9 bg-card" />
                    </div>
                    <Select value={userRoleFilter} onValueChange={(v: any) => setUserRoleFilter(v)}>
                      <SelectTrigger className="w-[130px] bg-card"><Filter className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="teacher">Teacher</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => exportToCSV(filteredUsers.map(u => ({
                      full_name: u.full_name, email: u.email, mobile: u.mobile, role: u.role, created_at: u.created_at
                    })), 'users')}>
                      <Download className="h-4 w-4 mr-1" /> Export
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  {filteredUsers.length === 0 ? (
                    <div className="text-center py-12">
                      <Users className="h-12 w-12 text-blue-500 mx-auto mb-3 opacity-20" />
                      <p className="text-muted-foreground">No users found.</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredUsers.map((u) => (
                        <div key={u.id} className="p-4 md:p-5 hover:bg-muted/40 transition-colors flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-base flex-shrink-0">
                            {u.full_name?.charAt(0)?.toUpperCase() || u.email?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground truncate text-sm">{u.full_name || 'Unnamed User'}</h3>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                            {u.mobile && <p className="text-xs text-muted-foreground/70">{u.mobile}</p>}
                          </div>
                          <div className="shrink-0">
                            <Select value={u.role || 'student'} onValueChange={(v) => handleChangeRole(u.id, v)} disabled={roleChanging[u.id]}>
                              <SelectTrigger className="w-28 h-8 text-xs">
                                {roleChanging[u.id] ? <span className="text-muted-foreground">Saving…</span> : <SelectValue />}
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="student">Student</SelectItem>
                                <SelectItem value="teacher">Teacher</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="text-right text-xs text-muted-foreground hidden md:block shrink-0">
                            <p>Joined</p>
                            <p className="font-medium text-foreground/70">{new Date(u.created_at!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </>)}</TabsContent>

          {/* TEACHERS TAB */}
          <TabsContent value="teachers">{activeTab === 'teachers' && (<>
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="border shadow-sm">
                <CardHeader className="border-b pb-4">
                  <CardTitle className="flex items-center gap-2 text-emerald-700"><UserCheck className="h-5 w-5" /> Active Teachers ({activeTeachers.length})</CardTitle>
                  <p className="text-sm text-muted-foreground">These users can access Students &amp; Attendance in the sidebar.</p>
                </CardHeader>
                <CardContent className="pt-4">
                  {activeTeachers.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No teachers assigned yet.</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px] pr-2">
                      <div className="space-y-2">
                        {activeTeachers.map(teacher => (
                          <div key={teacher.id} className="flex items-center justify-between p-3 rounded-lg border bg-emerald-50/40 hover:bg-emerald-50 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-emerald-700 font-bold text-sm">{(teacher.full_name || teacher.email || "?")[0].toUpperCase()}</span>
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">{teacher.full_name || "Unnamed"}</p>
                                <p className="text-xs text-muted-foreground truncate">{teacher.email}</p>
                              </div>
                            </div>
                            <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10 flex-shrink-0 ml-2"
                              disabled={roleChanging[teacher.id]} onClick={() => handleChangeRole(teacher.id, 'student')}>
                              {roleChanging[teacher.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <><UserX className="h-3 w-3 mr-1" />Revoke</>}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              <Card className="border shadow-sm">
                <CardHeader className="border-b pb-4">
                  <CardTitle className="flex items-center gap-2 text-primary"><GraduationCap className="h-5 w-5" /> Assign Teacher Role</CardTitle>
                  <div className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search students by name or email..." value={teacherSearch} onChange={(e) => setTeacherSearch(e.target.value)} className="pl-9" />
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  {promotableStudents.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">{teacherSearch ? "No students match your search." : "No students available."}</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px] pr-2">
                      <div className="space-y-2">
                        {promotableStudents.map(student => (
                          <div key={student.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                <span className="text-foreground font-bold text-sm">{(student.full_name || student.email || "?")[0].toUpperCase()}</span>
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">{student.full_name || "Unnamed"}</p>
                                <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                              </div>
                            </div>
                            <Button size="sm" className="flex-shrink-0 ml-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={roleChanging[student.id]} onClick={() => handleChangeRole(student.id, 'teacher')}>
                              {roleChanging[student.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <><GraduationCap className="h-3 w-3 mr-1" />Make Teacher</>}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          </>)}</TabsContent>

          {/* COURSES TAB */}
          <TabsContent value="courses">{activeTab === 'courses' && (<>
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>Create Course</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2"><Label>Title</Label><Input value={newCourse.title} onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })} placeholder="Class 10 Science" /></div>
                  <div className="space-y-2"><Label>Description</Label><Textarea value={newCourse.description} onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })} placeholder="Details..." /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Price (₹)</Label><Input type="number" value={newCourse.price} onChange={(e) => setNewCourse({ ...newCourse, price: e.target.value })} placeholder="499" /></div>
                    <div className="space-y-2"><Label>Grade</Label><Input value={newCourse.grade} onChange={(e) => setNewCourse({ ...newCourse, grade: e.target.value })} placeholder="10" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={newCourse.startDate} onChange={(e) => setNewCourse({ ...newCourse, startDate: e.target.value })} /></div>
                    <div className="space-y-2"><Label>End Date</Label><Input type="date" value={newCourse.endDate} onChange={(e) => setNewCourse({ ...newCourse, endDate: e.target.value })} /></div>
                  </div>
                  <div className="space-y-2">
                    <Label>Course Thumbnail</Label>
                    <div className="flex gap-2 mb-2">
                      <Button type="button" size="sm" variant={courseThumbnailMode === "file" ? "default" : "outline"} onClick={() => setCourseThumbnailMode("file")}>
                        <Upload className="h-3 w-3 mr-1" /> Upload
                      </Button>
                      <Button type="button" size="sm" variant={courseThumbnailMode === "url" ? "default" : "outline"} onClick={() => setCourseThumbnailMode("url")}>
                        <LinkIcon className="h-3 w-3 mr-1" /> URL
                      </Button>
                    </div>
                    {courseThumbnailMode === "file" ? (
                      <div className="border-2 border-dashed rounded-lg p-4 text-center">
                        <input type="file" accept="image/*" onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)} className="hidden" id="thumbnail-upload" />
                        <label htmlFor="thumbnail-upload" className="cursor-pointer">
                          {thumbnailFile ? (
                            <div className="flex items-center justify-center gap-2 text-green-600"><Eye className="h-5 w-5" /><span className="font-medium text-sm">{thumbnailFile.name}</span></div>
                          ) : (
                            <div className="text-muted-foreground text-sm"><Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" /><p>Click to upload thumbnail image</p></div>
                          )}
                        </label>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Input
                          placeholder="https://example.com/image.jpg"
                          value={courseThumbnailUrl}
                          onChange={(e) => setCourseThumbnailUrl(e.target.value)}
                        />
                        {courseThumbnailUrl && (
                          <img src={courseThumbnailUrl} alt="Preview" className="h-20 w-auto rounded-lg object-cover border" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        )}
                      </div>
                    )}
                  </div>
                  <Button className="w-full" onClick={handleCreateCourse} disabled={isCreatingCourse}>
                    {isCreatingCourse ? <Clock className="animate-spin mr-2" /> : <Plus className="mr-2 h-4 w-4" />} Create Course
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Course List</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => exportToCSV(filteredCourses.map(c => ({
                      title: c.title, description: c.description, price: c.price, grade: c.grade, created_at: c.created_at
                    })), 'courses')}>
                      <Download className="h-4 w-4 mr-1" /> Export
                    </Button>
                  </div>
                  <div className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search courses..." value={courseSearch} onChange={(e) => setCourseSearch(e.target.value)} className="pl-9" />
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[350px]">
                    <div className="space-y-3">
                      {filteredCourses.map((c) => (
                        <div key={c.id} className="p-3 border rounded-lg bg-card space-y-2">
                          {editingCourseId === c.id ? (
                            <div className="space-y-2">
                              <Input value={editCourseData.title} onChange={(e) => setEditCourseData({ ...editCourseData, title: e.target.value })} placeholder="Title" />
                              <Textarea value={editCourseData.description} onChange={(e) => setEditCourseData({ ...editCourseData, description: e.target.value })} placeholder="Description" rows={2} />
                              <div className="grid grid-cols-2 gap-2">
                                <Input value={editCourseData.price} onChange={(e) => setEditCourseData({ ...editCourseData, price: e.target.value })} placeholder="Price" type="number" />
                                <Input value={editCourseData.grade} onChange={(e) => setEditCourseData({ ...editCourseData, grade: e.target.value })} placeholder="Grade" />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1"><Label className="text-xs">Start Date</Label><Input type="date" value={editCourseData.startDate} onChange={(e) => setEditCourseData({ ...editCourseData, startDate: e.target.value })} /></div>
                                <div className="space-y-1"><Label className="text-xs">End Date</Label><Input type="date" value={editCourseData.endDate} onChange={(e) => setEditCourseData({ ...editCourseData, endDate: e.target.value })} /></div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Thumbnail</Label>
                                <div className="flex gap-2">
                                  <Button type="button" size="sm" variant={editThumbnailMode === "file" ? "default" : "outline"} onClick={() => setEditThumbnailMode("file")}>
                                    <Upload className="h-3 w-3 mr-1" /> Upload
                                  </Button>
                                  <Button type="button" size="sm" variant={editThumbnailMode === "url" ? "default" : "outline"} onClick={() => setEditThumbnailMode("url")}>
                                    <LinkIcon className="h-3 w-3 mr-1" /> URL
                                  </Button>
                                </div>
                                {editThumbnailMode === "file" ? (
                                  <div className="border border-dashed rounded p-2 text-center">
                                    <input type="file" accept="image/*" onChange={(e) => setEditThumbnailFile(e.target.files?.[0] || null)} className="hidden" id={`edit-thumb-${c.id}`} />
                                    <label htmlFor={`edit-thumb-${c.id}`} className="cursor-pointer text-xs text-muted-foreground">
                                      {editThumbnailFile ? editThumbnailFile.name : (c.thumbnail_url ? "Change thumbnail" : "Upload thumbnail")}
                                    </label>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <Input placeholder="https://example.com/image.jpg" value={editThumbnailUrl} onChange={(e) => setEditThumbnailUrl(e.target.value)} />
                                    {editThumbnailUrl && (
                                      <img src={editThumbnailUrl} alt="Thumbnail preview" className="h-20 w-auto rounded-lg object-cover border" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={handleSaveCourseEdit}><CheckCircle className="h-3 w-3 mr-1" /> Save</Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingCourseId(null)}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center">
                              <div><p className="font-semibold">{c.title}</p><p className="text-xs text-muted-foreground">₹{c.price} • Grade {c.grade}</p></div>
                              <div className="flex items-center gap-1">
                                <Button size="icon" variant="ghost" className="text-blue-500 hover:bg-blue-50" onClick={() => handleEditCourse(c)}><Eye className="h-4 w-4" /></Button>
                                <Button size="icon" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => handleDeleteCourse(c.id)}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {filteredCourses.length === 0 && <p className="text-center text-muted-foreground py-10">No courses found.</p>}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </>)}</TabsContent>

          {/* CONTENT TAB — uses ContentDrillDown with built-in upload */}
          <TabsContent value="content">
            <ContentDrillDown
              coursesList={coursesList}
              onNavigateToUpload={(courseId, chapterId) => navigate(`/admin/upload?course=${courseId}&chapter=${chapterId || ''}`)}
              onRefresh={fetchDashboardData}
            />
          </TabsContent>

          {/* SCHEDULE TAB */}
          <TabsContent value="schedule">
            <Card className="border shadow-sm">
              <CardHeader className="border-b pb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 min-w-0 break-words">
                    <Calendar className="h-5 w-5 text-primary shrink-0" />
                    <span className="min-w-0">Lecture Schedule</span>
                  </CardTitle>
                  <Button size="sm" onClick={() => navigate('/admin/schedule')} className="gap-2 shrink-0 ml-auto">
                    <ExternalLink className="h-4 w-4" />
                    <span className="hidden xs:inline sm:inline">Open Full Schedule</span>
                    <span className="xs:hidden sm:hidden">Open</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <p className="text-muted-foreground text-center py-8">Manage upcoming lecture schedules, create new sessions, and share meeting links with students.</p>
                <div className="flex justify-center gap-3 flex-wrap">
                  <Button variant="outline" onClick={() => navigate('/admin/schedule')} className="gap-2"><Plus className="h-4 w-4" /> Create & Manage Schedules</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/quiz')} className="gap-2"><ExternalLink className="h-4 w-4" /> Quiz Manager</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/study-materials')} className="gap-2"><Plus className="h-4 w-4" /> Study Materials</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/trusted-hosts')} className="gap-2"><ShieldAlert className="h-4 w-4" /> Trusted Hosts / CSP</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/security')} className="gap-2"><ShieldAlert className="h-4 w-4" /> Dependency Security Scan</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/users')} className="gap-2"><ShieldAlert className="h-4 w-4" /> Users & Block</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/moderation')} className="gap-2"><ShieldAlert className="h-4 w-4" /> Content Moderation</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/fraud-watch')} className="gap-2"><ShieldAlert className="h-4 w-4" /> Fraud Watch (Bypass Enrollments)</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* LIBRARY TAB */}
          {/* LIBRARY TAB — extracted to <LibraryManager />.
              Mount-on-demand (`activeTab === 'library'`) is preserved so the
              child only mounts when the operator opens this tab; React.memo
              on LibraryManager then prevents re-renders from sibling tab
              activity (coursesList is the only prop, and it's stable). */}
          <TabsContent value="library">
            {activeTab === 'library' && <LibraryManager coursesList={coursesList} />}
          </TabsContent>

          {/* SOCIAL TAB */}
          <TabsContent value="social"><SocialLinksManager /></TabsContent>

          {/* LIVE TAB */}
          <TabsContent value="live">
            <div className="flex flex-col items-center gap-4 py-8 px-4 text-center">
              <div className="p-4 rounded-2xl bg-destructive/10"><Radio className="h-10 w-10 text-destructive" /></div>
              <div>
                <h2 className="text-xl font-bold text-foreground mb-1">Live Class Manager</h2>
                <p className="text-muted-foreground text-sm max-w-sm">Schedule live YouTube sessions, go live with one click, manage chat and answer student doubts in real-time.</p>
              </div>
              <button onClick={() => navigate("/admin/live")} className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 px-6 py-2.5 rounded-lg font-semibold text-sm transition-colors">
                <Radio className="h-4 w-4" /> Open Live Manager
              </button>
            </div>
          </TabsContent>

          {/* BANNERS TAB */}
          <TabsContent value="banners"><HeroBannerManager /></TabsContent>
          <TabsContent value="landing-courses">{activeTab === 'landing-courses' && <LandingCoursesManager />}</TabsContent>
          <TabsContent value="testimonials">{activeTab === 'testimonials' && <TestimonialsManager />}</TabsContent>

          {/* DOUBTS TAB */}
          <TabsContent value="doubts">
            <div className="flex flex-col items-center gap-4 py-8 px-4 text-center">
              <div className="p-4 rounded-2xl bg-primary/10"><MessageSquare className="h-10 w-10 text-primary" /></div>
              <div>
                <h2 className="text-xl font-bold text-foreground mb-1">Zoom Doubt Sessions</h2>
                <p className="text-muted-foreground text-sm max-w-sm">View all student doubt requests, create Zoom meetings, and manage 1:1 sessions.</p>
              </div>
              <button onClick={() => navigate("/doubts")} className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2.5 rounded-lg font-semibold text-sm transition-colors">
                <MessageSquare className="h-4 w-4" /> Open Doubt Manager
              </button>
            </div>
          </TabsContent>

          {/* SESSIONS TAB */}
          <TabsContent value="sessions">{activeTab === 'sessions' && (<>
            <Card className="border shadow-sm">
              <CardHeader className="border-b pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2"><Monitor className="h-5 w-5 text-primary" /> Active Sessions ({sessionsList.length})</CardTitle>
                  <Button variant="outline" size="sm" onClick={fetchSessionsData} disabled={sessionsLoading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${sessionsLoading ? "animate-spin" : ""}`} /> Refresh
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-1">Monitor all active device sessions. Force-logout suspicious or excess sessions.</p>
              </CardHeader>
              <CardContent className="p-0">
                {sessionsLoading ? (
                  <div className="flex items-center justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : sessionsList.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                    <Monitor className="h-10 w-10" /><p className="font-medium">No active sessions</p><p className="text-sm">Sessions are created when users log in</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {sessionsList.map((s) => (
                      <div key={s.id} className="flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors">
                        <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${s.device_type === "mobile" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                          {s.device_type === "mobile" ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs capitalize shrink-0">{s.device_type}</Badge>
                            <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">{s.user_id}</span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{s.user_agent ? s.user_agent.substring(0, 70) + "..." : "Unknown browser"}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>Logged in: {new Date(s.logged_in_at).toLocaleString()}</span>
                            <span>·</span>
                            <span>Last active: {new Date(s.last_active_at).toLocaleString()}</span>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="shrink-0 text-destructive border-destructive/20 hover:bg-destructive/10"
                          onClick={() => handleForceLogout(s.id, s.user_id)} disabled={terminatingSession === s.id}>
                          {terminatingSession === s.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><LogOut className="h-3 w-3 mr-1" />Logout</>}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>)}</TabsContent>

          {/* ENROLLMENTS TAB - Manual Course Access */}
          <TabsContent value="enrollments">
            <EnrollmentManager coursesList={coursesList} usersList={usersList} />
          </TabsContent>

          {/* SYLLABUS TAB */}
          <TabsContent value="syllabus">
            <SyllabusManager />
          </TabsContent>

          {/* TIMETABLE TAB */}
          <TabsContent value="timetable">
            <TimetableManager />
          </TabsContent>

        </Tabs>
      </main>


      {/* REFUND CONFIRMATION DIALOG */}
      <Dialog open={!!refundConfirmPayment} onOpenChange={(open) => { if (!open) { setRefundConfirmPayment(null); setRefundConfirmText(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">⚠️ Confirm Refund</DialogTitle>
            <DialogDescription>
              You are about to refund <strong>₹{refundConfirmPayment?._amount}</strong> for course <strong>"{refundConfirmPayment?._course}"</strong>. 
              This will revoke the student's course access immediately. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Type <span className="font-bold text-destructive">REFUND</span> to confirm:</Label>
            <Input 
              value={refundConfirmText} 
              onChange={(e) => setRefundConfirmText(e.target.value)} 
              placeholder="Type REFUND here"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRefundConfirmPayment(null); setRefundConfirmText(""); }}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              disabled={refundConfirmText !== "REFUND"}
              onClick={handleInitiateRefund}
            >
              Confirm Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
