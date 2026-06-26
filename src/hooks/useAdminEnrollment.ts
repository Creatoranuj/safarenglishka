import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../integrations/supabase/client';
import { toast } from 'sonner';

interface AdminEnrollmentResult {
  success: boolean;
  alreadyEnrolled?: boolean;
  data?: {
    id: number;
    courseId: number;
  };
  error?: string;
}

export const useAdminEnrollment = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [isEnrolling, setIsEnrolling] = useState(false);

  const adminEnroll = async (courseId: number): Promise<AdminEnrollmentResult> => {
    if (!user) {
      toast.error('Please login first');
      return { success: false, error: 'Not authenticated' };
    }

    if (!isAdmin) {
      return { success: false, error: 'Admin access required' };
    }

    setIsEnrolling(true);

    try {
      // Check if already enrolled
      const { data: existingEnrollment } = await supabase
        .from('enrollments')
        .select('id')
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .maybeSingle();

      if (existingEnrollment) {
        toast.info('You are already enrolled in this course');
        navigate(`/classes/${courseId}/chapters?from=courses`);
        return {
          success: true,
          alreadyEnrolled: true,
          data: { id: existingEnrollment.id, courseId },
        };
      }

      // Upsert — safe against duplicates thanks to UNIQUE(user_id, course_id)
      const { data: enrollment, error } = await supabase
        .from('enrollments')
        .upsert(
          { user_id: user.id, course_id: courseId, status: 'active' },
          { onConflict: 'user_id,course_id', ignoreDuplicates: false }
        )
        .select('id')
        .single();

      if (error) throw error;

      toast.success('🎉 Admin Access Granted!', {
        description: 'You now have full access to this course.',
      });

      navigate(`/classes/${courseId}/chapters?from=courses`);

      return {
        success: true,
        alreadyEnrolled: false,
        data: { id: enrollment.id, courseId },
      };
    } catch (error: any) {
      console.error('Admin enrollment error:', error);
      toast.error(error.message || 'Failed to enroll');
      return { success: false, error: error.message };
    } finally {
      setIsEnrolling(false);
    }
  };

  return {
    adminEnroll,
    isAdmin,
    isEnrolling,
  };
};
