import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { LoadingSpinner } from "../components/ui/loading-spinner";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, ChevronLeft, Trophy, Clock,
  RotateCcw, ChevronDown, ChevronUp, Lightbulb,
  Bell, BookOpen, BarChart3, Target, TrendingUp,
  Award, Minus,
} from "lucide-react";
import { cn } from "../lib/utils";
import { QuizQuestionThumb } from "../components/quiz/QuizQuestionImage";

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
  marks: number;
  negative_marks: number;
  order_index: number;
  image_url?: string | null;
}

interface Attempt {
  id: string;
  score: number;
  percentage: number;
  passed: boolean;
  answers: Record<string, string>;
  time_taken_seconds: number;
  submitted_at: string;
  quiz_id: string;
  user_id: string;
}

interface Quiz {
  id: string;
  title: string;
  total_marks: number;
  pass_percentage: number;
  type: string;
  duration_minutes: number;
}

interface SectionStats {
  name: string;
  questions: Question[];
  correct: number;
  incorrect: number;
  skipped: number;
  marksObtained: number;
  marksLost: number;
  totalMarks: number;
  accuracy: number;
  timeSeconds: number;
}

// Derive section labels based on quiz type and question count
const getSectionLabels = (quizType: string, count: number): string[] => {
  const type = quizType?.toLowerCase() || "";
  if (count <= 20) return ["All Questions"];
  if (count <= 44) {
    if (type.includes("bio") || type.includes("neet")) return ["Physics", "Biology"];
    return ["Section A", "Section B"];
  }
  // 45+
  if (type.includes("neet") || type.includes("bio") || type.includes("medical"))
    return ["Physics", "Chemistry", "Biology"];
  if (type.includes("jee") || type.includes("math") || type.includes("eng"))
    return ["Physics", "Chemistry", "Mathematics"];
  return ["Section A", "Section B", "Section C"];
};

const QuizResult = () => {
  const { quizId, attemptId } = useParams();
  const navigate = useNavigate();
  const reviewRef = useRef<HTMLDivElement>(null);

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [rank, setRank] = useState<number | null>(null);
  const [totalParticipants, setTotalParticipants] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"summary" | "leaderboard">("summary");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchData = async () => {
      if (!quizId || !attemptId) return;
      try {
        const [quizRes, questionsRes, attemptRes] = await Promise.all([
          supabase.from("quizzes").select("*").eq("id", quizId).single(),
          supabase.from("questions").select("*").eq("quiz_id", quizId).order("order_index"),
          supabase.from("quiz_attempts").select("*").eq("id", attemptId).single(),
        ]);
        if (quizRes.error) throw quizRes.error;
        if (questionsRes.error) throw questionsRes.error;
        if (attemptRes.error) throw attemptRes.error;

        const attemptData = {
          ...attemptRes.data,
          answers: (attemptRes.data.answers as Record<string, string>) || {},
        } as Attempt;

        setQuiz(quizRes.data as Quiz);
        setQuestions(
          (questionsRes.data || []).map((q: any) => ({
            ...q,
            options: Array.isArray(q.options) ? q.options : (q.options ? Object.values(q.options) : null),
          }))
        );
        setAttempt(attemptData);

        // Fetch attempt count for badge
        const { count } = await supabase
          .from("quiz_attempts")
          .select("id", { count: "exact", head: true })
          .eq("quiz_id", quizId)
          .eq("user_id", attemptData.user_id)
          .lte("submitted_at", attemptData.submitted_at);
        setAttemptNumber(count || 1);

      } catch (err: any) {
        toast.error(err.message);
        navigate("/all-tests");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [quizId, attemptId]);

  // Compute live rank against all other students' best attempts on this quiz
  useEffect(() => {
    if (!quizId || !attempt) return;
    (async () => {
      const { data, error } = await supabase
        .from("quiz_attempts")
        .select("user_id, score")
        .eq("quiz_id", quizId);
      if (error || !data) return;
      const bestByUser = new Map<string, number>();
      for (const row of data) {
        const prev = bestByUser.get(row.user_id) ?? -Infinity;
        if ((row.score ?? 0) > prev) bestByUser.set(row.user_id, row.score ?? 0);
      }
      const myBest = bestByUser.get(attempt.user_id) ?? attempt.score;
      let higher = 0;
      bestByUser.forEach((s) => { if (s > myBest) higher += 1; });
      setRank(higher + 1);
      setTotalParticipants(bestByUser.size);
    })();
  }, [quizId, attempt?.id]);

  const formatTime = (seconds: number) => {
    if (!seconds) return "—";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  };

  const toggleExpand = (id: string) => {
    const updated = new Set(expandedIds);
    if (updated.has(id)) updated.delete(id); else updated.add(id);
    setExpandedIds(updated);
  };

  const toggleSection = (name: string) => {
    const updated = new Set(expandedSections);
    if (updated.has(name)) updated.delete(name); else updated.add(name);
    setExpandedSections(updated);
  };

  if (loading) return <LoadingSpinner fullPage size="lg" text="Loading results..." />;
  if (!quiz || !attempt) return null;

  // ── Core Stats ──────────────────────────────────────────────────────────────
  const totalMarks = quiz.total_marks || questions.reduce((s, q) => s + q.marks, 0);
  const totalQ = questions.length;

  const correctCount = questions.filter((q) => attempt.answers[q.id] === q.correct_answer).length;
  const incorrectCount = questions.filter(
    (q) => attempt.answers[q.id] && attempt.answers[q.id] !== q.correct_answer
  ).length;
  const skippedCount = totalQ - correctCount - incorrectCount;

  const marksObtained = questions
    .filter((q) => attempt.answers[q.id] === q.correct_answer)
    .reduce((s, q) => s + q.marks, 0);
  const marksLost = questions
    .filter((q) => attempt.answers[q.id] && attempt.answers[q.id] !== q.correct_answer)
    .reduce((s, q) => s + (q.negative_marks || 0), 0);
  const marksSkipped = questions
    .filter((q) => !attempt.answers[q.id])
    .reduce((s, q) => s + q.marks, 0);

  const accuracy =
    correctCount + incorrectCount > 0
      ? Math.round((correctCount / (correctCount + incorrectCount)) * 100)
      : 0;

  // ── Sectional Breakdown ──────────────────────────────────────────────────────
  const sectionLabels = getSectionLabels(quiz.type, totalQ);
  const chunkSize = Math.ceil(totalQ / sectionLabels.length);
  const totalTime = attempt.time_taken_seconds || 0;

  const sections: SectionStats[] = sectionLabels.map((name, idx) => {
    const secQs = questions.slice(idx * chunkSize, (idx + 1) * chunkSize);
    const sc = secQs.filter((q) => attempt.answers[q.id] === q.correct_answer).length;
    const si = secQs.filter((q) => attempt.answers[q.id] && attempt.answers[q.id] !== q.correct_answer).length;
    const ss = secQs.length - sc - si;
    const sm = secQs.filter((q) => attempt.answers[q.id] === q.correct_answer).reduce((s, q) => s + q.marks, 0);
    const sl = secQs.filter((q) => attempt.answers[q.id] && attempt.answers[q.id] !== q.correct_answer).reduce((s, q) => s + (q.negative_marks || 0), 0);
    const stm = secQs.reduce((s, q) => s + q.marks, 0);
    const secTime = Math.round((secQs.length / (totalQ || 1)) * totalTime);
    return {
      name,
      questions: secQs,
      correct: sc,
      incorrect: si,
      skipped: ss,
      marksObtained: sm,
      marksLost: sl,
      totalMarks: stm,
      accuracy: sc + si > 0 ? Math.round((sc / (sc + si)) * 100) : 0,
      timeSeconds: secTime,
    };
  });

  const scoreDisplay = `${marksObtained}/${totalMarks}`;

  // Colour helpers
  const scoreColor = marksObtained >= totalMarks * 0.6 ? "text-green-400" : marksObtained >= totalMarks * 0.35 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* ── Sticky Header ── */}
      <header
        className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b shadow-sm pt-[env(safe-area-inset-top)]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center gap-3 max-w-3xl mx-auto px-4 py-3">
          <button onClick={() => navigate("/all-tests")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{quiz.type?.toUpperCase() || "QUIZ"}</p>
            <h1 className="text-sm font-semibold text-foreground truncate">{quiz.title}</h1>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs border-primary/40 text-primary">
            Attempt {attemptNumber}
          </Badge>
        </div>
      </header>

      {/* ── Live Rank Banner ── */}
      {rank !== null && totalParticipants !== null && (
        <div className="bg-primary/10 border-b border-primary/20">
          <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-2.5">
            <Trophy className="h-4 w-4 text-primary shrink-0" />
            <p className="text-xs text-foreground/80">
              Your rank: <span className="font-semibold text-primary">#{rank}</span> of {totalParticipants}{" "}
              participant{totalParticipants === 1 ? "" : "s"}
              {totalParticipants > 1 && (
                <> · Top <span className="font-semibold">{Math.max(1, Math.round((rank / totalParticipants) * 100))}%</span></>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 pt-5 space-y-5">

        {/* ── Hero Score Card ── */}
        <div className="rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br from-primary/90 to-primary text-primary-foreground">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-primary-foreground/70 text-xs font-medium uppercase tracking-wider">Overall Score</p>
                <h2 className={cn("text-4xl font-black mt-1", scoreColor)}>{scoreDisplay}</h2>
              </div>
              <div className="text-right">
                <p className="text-primary-foreground/70 text-xs font-medium uppercase tracking-wider">Accuracy</p>
                <p className="text-2xl font-bold mt-1 text-primary-foreground">{accuracy}%</p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-primary-foreground/70 mb-5">
              <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{totalQ} Questions</span>
              <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />{totalMarks} Marks</span>
              {quiz.duration_minutes > 0 && (
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{quiz.duration_minutes} min</span>
              )}
            </div>

            {/* Rank/Percentile placeholders */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-xs text-primary-foreground/60 mb-1">Percentile</p>
                <p className="text-xl font-bold text-primary-foreground">--</p>
                <p className="text-[10px] text-primary-foreground/50 mt-0.5">Result Awaited</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-xs text-primary-foreground/60 mb-1">Rank</p>
                <p className="text-xl font-bold text-primary-foreground">—</p>
                <p className="text-[10px] text-primary-foreground/50 mt-0.5">Result Awaited</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 bg-white/10 border-white/20 text-primary-foreground hover:bg-white/20 gap-1.5"
                onClick={() => navigate(`/quiz/${quizId}`)}
              >
                <RotateCcw className="h-4 w-4" />
                Reattempt
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-white text-primary hover:bg-white/90 gap-1.5 font-semibold"
                onClick={() => reviewRef.current?.scrollIntoView({ behavior: "smooth" })}
              >
                <BookOpen className="h-4 w-4" />
                View Solution ↓
              </Button>
            </div>
          </div>

          {/* Time bar at bottom of hero */}
          <div className="bg-black/20 px-5 py-2.5 flex items-center justify-between text-xs text-primary-foreground/70">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Time Taken: <strong className="text-primary-foreground">{formatTime(attempt.time_taken_seconds)}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              {attempt.passed ? "✓ Passed" : "✗ Not Passed"} ({quiz.pass_percentage}% required)
            </span>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
          {/* Tab bar */}
          <div className="flex border-b">
            {(["summary", "leaderboard"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 py-3 text-sm font-semibold transition-colors",
                  activeTab === tab
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === "summary" ? "📊 Result Summary" : "🏆 Leaderboard"}
              </button>
            ))}
          </div>

          {/* ── Result Summary ── */}
          {activeTab === "summary" && (
            <div className="p-4 space-y-5">

              {/* Correct / Incorrect / Skipped progress rows */}
              <div className="space-y-3">
                {/* Correct */}
                <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-semibold text-foreground">Correct</span>
                      <span className="text-xs text-muted-foreground">{correctCount}/{totalQ}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-green-600">+{marksObtained}</span>
                      <span className="text-xs text-muted-foreground ml-1">marks</span>
                    </div>
                  </div>
                  <Progress
                    value={totalQ > 0 ? (correctCount / totalQ) * 100 : 0}
                    className="h-2 bg-green-100 dark:bg-green-900/30"
                  />
                </div>

                {/* Incorrect */}
                <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="text-sm font-semibold text-foreground">Incorrect</span>
                      <span className="text-xs text-muted-foreground">{incorrectCount}/{totalQ}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-destructive">-{marksLost}</span>
                      <span className="text-xs text-muted-foreground ml-1">marks lost</span>
                    </div>
                  </div>
                  <Progress
                    value={totalQ > 0 ? (incorrectCount / totalQ) * 100 : 0}
                    className="h-2 bg-red-100 dark:bg-red-900/30"
                  />
                </div>

                {/* Skipped */}
                <div className="bg-muted/30 border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Minus className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">Skipped</span>
                      <span className="text-xs text-muted-foreground">{skippedCount}/{totalQ}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-muted-foreground">{marksSkipped}</span>
                      <span className="text-xs text-muted-foreground ml-1">marks skipped</span>
                    </div>
                  </div>
                  <Progress
                    value={totalQ > 0 ? (skippedCount / totalQ) * 100 : 0}
                    className="h-2"
                  />
                </div>
              </div>

              {/* Quick stats row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-card border rounded-xl p-3 text-center">
                  <BarChart3 className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-base font-bold text-foreground">{accuracy}%</p>
                  <p className="text-[11px] text-muted-foreground">Accuracy</p>
                </div>
                <div className="bg-card border rounded-xl p-3 text-center">
                  <Clock className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-base font-bold text-foreground">{formatTime(attempt.time_taken_seconds)}</p>
                  <p className="text-[11px] text-muted-foreground">Time Taken</p>
                </div>
                <div className="bg-card border rounded-xl p-3 text-center">
                  <Award className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-base font-bold text-foreground">{marksObtained - marksLost}</p>
                  <p className="text-[11px] text-muted-foreground">Net Score</p>
                </div>
              </div>

              {/* Sectional Performance */}
              {sections.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Sectional Performance
                  </h3>
                  <div className="space-y-2">
                    {sections.map((sec) => {
                      const isOpen = expandedSections.has(sec.name);
                      return (
                        <div key={sec.name} className="border rounded-xl overflow-hidden bg-card">
                          <button
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                            onClick={() => toggleSection(sec.name)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-xs font-bold text-primary">{sec.name[0]}</span>
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-semibold text-foreground">{sec.name}</p>
                                <p className="text-xs text-muted-foreground">{sec.questions.length} questions · {sec.totalMarks} marks</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-sm font-bold text-foreground">{sec.marksObtained}/{sec.totalMarks}</p>
                                <p className="text-[11px] text-muted-foreground">{sec.accuracy}% accuracy</p>
                              </div>
                              {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                            </div>
                          </button>

                          {isOpen && (
                            <div className="border-t bg-muted/10 px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {[
                                { label: "Score", value: `${sec.marksObtained - sec.marksLost}/${sec.totalMarks}`, icon: Target, color: "text-primary" },
                                { label: "Correct", value: String(sec.correct), icon: CheckCircle2, color: "text-green-500" },
                                { label: "Incorrect", value: String(sec.incorrect), icon: XCircle, color: "text-destructive" },
                                { label: "Skipped", value: String(sec.skipped), icon: Minus, color: "text-muted-foreground" },
                                { label: "Accuracy", value: `${sec.accuracy}%`, icon: BarChart3, color: "text-primary" },
                                { label: "Time", value: formatTime(sec.timeSeconds), icon: Clock, color: "text-muted-foreground" },
                              ].map(({ label, value, icon: Icon, color }) => (
                                <div key={label} className="flex items-center gap-2 bg-card rounded-lg px-3 py-2 border">
                                  <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
                                  <div>
                                    <p className="text-[11px] text-muted-foreground">{label}</p>
                                    <p className="text-sm font-bold text-foreground">{value}</p>
                                  </div>
                                </div>
                              ))}

                              {/* Percentile / Rank placeholders */}
                              <div className="col-span-2 sm:col-span-3 grid grid-cols-2 gap-2 mt-1">
                                <div className="bg-card border rounded-lg px-3 py-2 text-center">
                                  <p className="text-[11px] text-muted-foreground">Percentile</p>
                                  <p className="text-sm font-bold text-muted-foreground">Result Awaited</p>
                                </div>
                                <div className="bg-card border rounded-lg px-3 py-2 text-center">
                                  <p className="text-[11px] text-muted-foreground">Rank</p>
                                  <p className="text-sm font-bold text-muted-foreground">Result Awaited</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* View Detailed Analysis CTA */}
              <Button
                variant="outline"
                className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5"
                onClick={() => reviewRef.current?.scrollIntoView({ behavior: "smooth" })}
              >
                <BookOpen className="h-4 w-4" />
                View Detailed Answer Analysis ↓
              </Button>
            </div>
          )}

          {/* ── Leaderboard Tab ── */}
          {activeTab === "leaderboard" && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4">
                <Trophy className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">Leaderboard Coming Soon</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                The leaderboard and ranking will be published once the result window closes and all students have attempted this test.
              </p>
              <div className="mt-6 p-4 bg-muted/20 rounded-xl border border-dashed space-y-2">
                {[1, 2, 3].map((rank) => (
                  <div key={rank} className="flex items-center gap-3 animate-pulse">
                    <div className="w-7 h-7 rounded-full bg-muted" />
                    <div className="flex-1 h-3 bg-muted rounded" />
                    <div className="w-12 h-3 bg-muted rounded" />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground text-center pt-2">Result Awaited…</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Answer Review ── */}
        <div ref={reviewRef} id="answer-review">
          <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Detailed Answer Review
            <span className="text-xs text-muted-foreground font-normal ml-1">({totalQ} questions)</span>
          </h3>
          <div className="space-y-3">
            {questions.map((q, idx) => {
              const userAns = attempt.answers[q.id];
              const isCorrect = userAns === q.correct_answer;
              const isSkipped = !userAns;
              const isExpanded = expandedIds.has(q.id);

              return (
                <div
                  key={q.id}
                  className={cn(
                    "border-2 rounded-xl overflow-hidden",
                    isCorrect
                      ? "border-green-500/30 bg-green-500/5"
                      : isSkipped
                      ? "border-border bg-card"
                      : "border-destructive/30 bg-destructive/5"
                  )}
                >
                  <button
                    className="w-full flex items-start gap-3 p-4 text-left"
                    onClick={() => toggleExpand(q.id)}
                  >
                    <div className="shrink-0 mt-0.5">
                      {isCorrect ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : isSkipped ? (
                        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                      ) : (
                        <XCircle className="h-5 w-5 text-destructive" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">Q{idx + 1}</p>
                      {(q as any).image_url && (
                        <QuizQuestionThumb src={(q as any).image_url} />
                      )}
                      <p className="text-sm font-medium text-foreground line-clamp-2">{q.question_text}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className={cn(
                        "text-xs font-semibold",
                        isCorrect ? "text-green-600" : isSkipped ? "text-muted-foreground" : "text-destructive"
                      )}>
                        {isCorrect ? `+${q.marks}` : isSkipped ? "0" : `-${q.negative_marks}`}
                      </span>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border/50">
                      {q.options && (
                        <div className="space-y-2 mt-3">
                          {q.options.map((opt, i) => {
                            const optKey = String(i);
                            const isUserChoice = userAns === optKey;
                            const isCorrectOpt = q.correct_answer === optKey;
                            return (
                              <div
                                key={i}
                                className={cn(
                                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                                  isCorrectOpt
                                    ? "bg-green-500/15 border border-green-500/30 text-green-700 dark:text-green-400"
                                    : isUserChoice && !isCorrectOpt
                                    ? "bg-destructive/15 border border-destructive/30 text-destructive"
                                    : "bg-muted/30"
                                )}
                              >
                                <span className="font-semibold text-xs w-5">{String.fromCharCode(65 + i)}.</span>
                                <span className="flex-1">{opt}</span>
                                {isCorrectOpt && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                                {isUserChoice && !isCorrectOpt && <XCircle className="h-4 w-4 text-destructive" />}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {q.question_type === "true_false" && (
                        <div className="text-sm mt-2">
                          <span className="text-muted-foreground">Correct: </span>
                          <span className="font-semibold text-green-600 capitalize">{q.correct_answer}</span>
                          {userAns && (
                            <>
                              <span className="text-muted-foreground ml-3">Your answer: </span>
                              <span className={cn("font-semibold capitalize", isCorrect ? "text-green-600" : "text-destructive")}>{userAns}</span>
                            </>
                          )}
                        </div>
                      )}

                      {q.explanation && (
                        <div className="flex gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                          <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <p className="text-sm text-foreground">{q.explanation}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuizResult;
