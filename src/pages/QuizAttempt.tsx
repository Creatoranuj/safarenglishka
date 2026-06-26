import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { Label } from "../components/ui/label";
import { LoadingSpinner } from "../components/ui/loading-spinner";
import QuizTimer from "../components/quiz/QuizTimer";
import QuestionPalette from "../components/quiz/QuestionPalette";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Flag, Send, AlertTriangle, X, Menu,
} from "lucide-react";
import { cn } from "../lib/utils";
import { tapLight, tapMedium } from "../lib/nativeChrome";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "../components/ui/alert-dialog";

// correct_answer & explanation are intentionally omitted —
// questions are fetched via get_quiz_questions RPC (secure, no answers exposed).
interface Question {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  marks: number;
  negative_marks: number;
  order_index: number;
  image_url?: string | null;
}

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  type: string;
  duration_minutes: number;
  total_marks: number;
  pass_percentage: number;
}

const QuizAttempt = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const startedAt = useRef<Date>(new Date());

  // SECURITY: localStorage keys MUST be scoped by user.id, otherwise a shared
  // device leaks the previous user's in-progress answers to whoever logs in next.
  // Wait until `user` is loaded before reading/writing.
  const answersKey = user && quizId ? `quiz_answers_${user.id}_${quizId}` : null;
  const flaggedKey = user && quizId ? `quiz_flagged_${user.id}_${quizId}` : null;

  // Load from localStorage on mount (after we know who the user is)
  useEffect(() => {
    if (!answersKey || !flaggedKey) return;
    const saved = localStorage.getItem(answersKey);
    if (saved) {
      try { setAnswers(JSON.parse(saved)); } catch {}
    }
    const savedFlagged = localStorage.getItem(flaggedKey);
    if (savedFlagged) {
      try { setFlagged(new Set(JSON.parse(savedFlagged))); } catch {}
    }
  }, [answersKey, flaggedKey]);

  useEffect(() => {
    const fetchQuizData = async () => {
      if (!quizId) return;
      try {
        const [quizRes, questionsRes] = await Promise.all([
          supabase.from("quizzes").select("*").eq("id", quizId).single(),
          supabase.rpc("get_quiz_questions", { _quiz_id: quizId }),
        ]);
        if (quizRes.error) throw quizRes.error;
        if (questionsRes.error) throw questionsRes.error;

        setQuiz(quizRes.data as Quiz);
        const qs = (questionsRes.data || []).map((q: any) => ({
          ...q,
          options: Array.isArray(q.options) ? q.options : (q.options ? Object.values(q.options) : null),
        }));
        setQuestions(qs);

        // Attempt record is created only on submit to avoid orphan rows
      } catch (err: any) {
        toast.error("Failed to load quiz: " + err.message);
        navigate(-1);
      } finally {
        setLoading(false);
      }
    };
    fetchQuizData();
  }, [quizId, user]);

  const saveAnswerToLocal = useCallback((newAnswers: Record<string, string>) => {
    if (answersKey) localStorage.setItem(answersKey, JSON.stringify(newAnswers));
  }, [answersKey]);

  const handleAnswer = (questionId: string, value: string) => {
    const updated = { ...answers, [questionId]: value };
    setAnswers(updated);
    saveAnswerToLocal(updated);
    void tapLight();
  };

  const toggleFlag = (questionId: string) => {
    const updated = new Set(flagged);
    if (updated.has(questionId)) updated.delete(questionId);
    else updated.add(questionId);
    setFlagged(updated);
    if (flaggedKey) localStorage.setItem(flaggedKey, JSON.stringify([...updated]));
  };

  // One-shot guard: timer auto-submit + manual submit can race. Without this
  // the auto-submit could fire a second scoring request while the first is in
  // flight, producing duplicate attempts.
  const submittedRef = useRef(false);
  const handleSubmit = useCallback(async () => {
    if (!quiz || !user || !quizId) return;
    if (submittedRef.current) return;
    submittedRef.current = true;
    void tapMedium();
    setSubmitting(true);
    try {
      const timeTaken = Math.floor((new Date().getTime() - startedAt.current.getTime()) / 1000);

      // Native APK has no Express proxy — must call the Edge Function
      // via the Supabase JS client which knows the project URL.
      const { data, error } = await supabase.functions.invoke("score-quiz", {
        body: { quiz_id: quizId, answers, time_taken_seconds: timeTaken },
      });
      if (error) throw new Error(error.message || "Scoring failed");
      if (!data?.attempt_id) throw new Error("No attempt ID returned from server");

      // Clean localStorage
      if (answersKey) localStorage.removeItem(answersKey);
      if (flaggedKey) localStorage.removeItem(flaggedKey);

      navigate(`/quiz/${quizId}/result/${data.attempt_id}`);
    } catch (err: any) {
      // Allow retry after failure
      submittedRef.current = false;
      toast.error("Submit failed: " + (err.message ?? "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  }, [quiz, user, quizId, answers, navigate, answersKey, flaggedKey]);

  if (loading) return <LoadingSpinner fullPage size="lg" text="Loading quiz..." />;
  if (!quiz || questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
          <p className="text-muted-foreground">Quiz not found or has no questions.</p>
          <Button onClick={() => navigate(-1)}>Go Back</Button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const questionIds = questions.map((q) => q.id);
  const answeredCount = Object.keys(answers).filter((k) => answers[k]).length;
  const totalMarks = quiz.total_marks || questions.reduce((s, q) => s + q.marks, 0);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card border-b shadow-sm px-4 py-3">
        <div className="flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => setShowSubmitDialog(true)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">{quiz.title}</h1>
            <p className="text-xs text-muted-foreground">
              {answeredCount}/{questions.length} answered · {totalMarks} marks
            </p>
          </div>
          {quiz.duration_minutes > 0 && (
            <QuizTimer
              totalSeconds={quiz.duration_minutes * 60}
              onTimeUp={() => {
                toast.warning("Time's up! Auto-submitting...");
                handleSubmit();
              }}
            />
          )}
          <button
            onClick={() => setShowPalette(!showPalette)}
            className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 max-w-5xl mx-auto w-full">
        {/* Main Question Area */}
        <main className="flex-1 p-4 md:p-6">
          {/* Question number */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
              Question {currentIndex + 1} of {questions.length}
            </span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-green-600 font-medium">+{currentQ.marks}</span>
              {currentQ.negative_marks > 0 && (
                <span className="text-destructive font-medium">−{currentQ.negative_marks}</span>
              )}
              <button
                onClick={() => toggleFlag(currentQ.id)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-full border transition-colors",
                  flagged.has(currentQ.id)
                    ? "bg-yellow-500/10 border-yellow-400 text-yellow-600"
                    : "border-border text-muted-foreground hover:border-yellow-400"
                )}
              >
                <Flag className={cn("h-3 w-3", flagged.has(currentQ.id) && "fill-yellow-500")} />
                {flagged.has(currentQ.id) ? "Flagged" : "Flag"}
              </button>
            </div>
          </div>

          {/* Question text */}
          <div className="bg-card border rounded-xl p-5 mb-6 shadow-sm">
            {currentQ.image_url && (
              <img
                src={currentQ.image_url}
                alt="Question"
                className="rounded-lg max-h-64 w-full object-contain mb-4 border"
              />
            )}
            <p className="text-foreground text-base font-medium leading-relaxed whitespace-pre-wrap">
              {currentQ.question_text}
            </p>
          </div>

          {/* Options */}
          {currentQ.question_type === "mcq" && currentQ.options && (
            <RadioGroup
              value={answers[currentQ.id] || ""}
              onValueChange={(val) => handleAnswer(currentQ.id, val)}
              className="space-y-3"
            >
              {currentQ.options.map((opt, idx) => {
                const optKey = String(idx);
                const isSelected = answers[currentQ.id] === optKey;
                return (
                  <div
                    key={idx}
                    onClick={() => handleAnswer(currentQ.id, optKey)}
                    className={cn(
                      "flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
                      isSelected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <RadioGroupItem value={optKey} id={`opt-${idx}`} className="mt-0.5 shrink-0" />
                    <Label htmlFor={`opt-${idx}`} className="cursor-pointer flex-1 leading-relaxed text-sm">
                      <span className="font-semibold text-primary mr-2">
                        {String.fromCharCode(65 + idx)}.
                      </span>
                      {opt}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          )}

          {currentQ.question_type === "true_false" && (
            <RadioGroup
              value={answers[currentQ.id] || ""}
              onValueChange={(val) => handleAnswer(currentQ.id, val)}
              className="grid grid-cols-2 gap-4"
            >
              {["True", "False"].map((opt) => (
                <div
                  key={opt}
                  onClick={() => handleAnswer(currentQ.id, opt.toLowerCase())}
                  className={cn(
                    "flex items-center justify-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all",
                    answers[currentQ.id] === opt.toLowerCase()
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40"
                  )}
                >
                  <RadioGroupItem value={opt.toLowerCase()} id={`tf-${opt}`} />
                  <Label htmlFor={`tf-${opt}`} className="cursor-pointer font-medium">
                    {opt}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}

          {currentQ.question_type === "numerical" && (
            <input
              type="number"
              value={answers[currentQ.id] || ""}
              onChange={(e) => handleAnswer(currentQ.id, e.target.value)}
              placeholder="Enter your numerical answer"
              className="w-full px-4 py-3 border-2 rounded-xl text-base focus:outline-none focus:border-primary bg-card transition-colors"
            />
          )}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-8 gap-3">
            <Button
              variant="outline"
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              className="gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>

            {currentIndex < questions.length - 1 ? (
              <Button
                onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                className="gap-1.5"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => setShowSubmitDialog(true)}
                className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
              >
                <Send className="h-4 w-4" />
                Submit Quiz
              </Button>
            )}
          </div>
        </main>

        {/* Sidebar Palette (desktop) */}
        <aside
          className={cn(
            "hidden md:block w-72 border-l bg-card/50 p-4 sticky top-[65px] h-[calc(100vh-65px)] overflow-y-auto",
          )}
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Question Palette</h3>
          <QuestionPalette
            total={questions.length}
            currentIndex={currentIndex}
            answers={answers}
            flagged={flagged}
            questionIds={questionIds}
            onNavigate={setCurrentIndex}
          />
          <div className="mt-6">
            <Button
              className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setShowSubmitDialog(true)}
            >
              <Send className="h-4 w-4" />
              Submit Quiz
            </Button>
          </div>
        </aside>
      </div>

      {/* Mobile Palette Drawer */}
      {showPalette && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm md:hidden" onClick={() => setShowPalette(false)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-72 bg-card border-l p-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Question Palette</h3>
              <button onClick={() => setShowPalette(false)}><X className="h-4 w-4" /></button>
            </div>
            <QuestionPalette
              total={questions.length}
              currentIndex={currentIndex}
              answers={answers}
              flagged={flagged}
              questionIds={questionIds}
              onNavigate={(idx) => { setCurrentIndex(idx); setShowPalette(false); }}
            />
            <div className="mt-6">
              <Button
                className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => { setShowPalette(false); setShowSubmitDialog(true); }}
              >
                <Send className="h-4 w-4" />
                Submit Quiz
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Confirmation Dialog */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Quiz?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>You have answered <strong>{answeredCount}</strong> of <strong>{questions.length}</strong> questions.</p>
                {answeredCount < questions.length && (
                  <p className="text-destructive text-sm">
                    ⚠️ {questions.length - answeredCount} questions are unanswered.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">Once submitted, you cannot change your answers.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Attempting</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {submitting ? "Submitting..." : "Yes, Submit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default QuizAttempt;
