import { useState, memo, useCallback } from "react";
import { reportError } from "@/lib/sentry";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "../ui/use-toast";
import { ArrowRight } from "lucide-react";
import { supabase } from "../../integrations/supabase/client";

const grades = ["9", "10", "11", "12", "NEET Dropper"];

const LeadForm = memo(() => {
  const [formData, setFormData] = useState({ studentName: "", email: "", grade: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.studentName || !formData.email || !formData.grade) {
      toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Sign in required", description: "Please sign in to book a free demo.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
      const { error } = await supabase.from('leads').insert([{
        student_name: formData.studentName,
        email: formData.email,
        grade: formData.grade,
        user_id: user.id,
      }]);
      if (error) throw error;
      toast({ title: "Success", description: "Request received!" });
      setFormData({ studentName: "", email: "", grade: "" });
    } catch (error: any) {
      reportError(error, { surface: "LeadForm.submit" });
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }, [formData]);

  return (
    <section className="py-20 md:py-28 bg-secondary text-secondary-foreground">
      <div className="container mx-auto max-w-7xl px-6 lg:px-10">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          <div className="lg:col-span-6 space-y-6">
            <p className="text-xs uppercase tracking-[0.18em] text-accent font-medium">Start today</p>
            <h2
              className="font-serif text-4xl md:text-5xl lg:text-6xl leading-[1.05]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Your NEET journey starts with one decision.
            </h2>
            <p className="text-lg text-secondary-foreground/70 max-w-lg leading-relaxed">
              Book a free demo class. Meet your mentors. See if Safar English is right for you — no commitment, no card required.
            </p>
          </div>

          <div className="lg:col-span-6">
            <form
              onSubmit={handleSubmit}
              className="bg-background text-foreground p-8 md:p-10 rounded-sm border border-border space-y-5"
            >
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Full Name</label>
                <Input
                  placeholder="Your name"
                  value={formData.studentName}
                  onChange={(e) => handleInputChange("studentName", e.target.value)}
                  className="h-12 rounded-sm border-border"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Email</label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className="h-12 rounded-sm border-border"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Class</label>
                <Select value={formData.grade} onValueChange={(val) => handleInputChange("grade", val)}>
                  <SelectTrigger className="h-12 rounded-sm border-border">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {grades.map((g) => (
                      <SelectItem key={g} value={g}>{g === "NEET Dropper" ? g : `Class ${g}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                className="w-full h-12 rounded-sm text-base font-medium gap-2"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Sending…" : "Book free demo"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
});

LeadForm.displayName = "LeadForm";
export default LeadForm;
