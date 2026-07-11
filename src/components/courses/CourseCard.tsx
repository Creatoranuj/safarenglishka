import { Card, CardContent, CardFooter, CardHeader } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { BookOpen, Clock, Star, CheckCircle } from "lucide-react";
import { SmartImage } from "../common/SmartImage";
import coursePlaceholder from "../../assets/thumbnails/pdf-default.svg";

// ✅ Type Definitions
export interface CourseProps {
  id: number;
  title: string;
  description: string;
  price: number;
  grade: string | number;
  image_url: string;
  rating?: number;
  duration?: string;
  lessons_count?: number;
}

interface CourseCardProps {
  course: CourseProps;
  onClick?: () => void;
  isAdmin?: boolean;
  onAdminEnroll?: (courseId: number) => Promise<any>;
  isEnrolling?: boolean;
  isEnrolled?: boolean;
  onEnrollFree?: () => void;
}

const CourseCard = ({ course, onClick, isAdmin, onAdminEnroll, isEnrolling, isEnrolled, onEnrollFree }: CourseCardProps) => {
  const handleClick = async () => {
    // Admin bypass for paid courses
    if (isAdmin && course.price > 0 && onAdminEnroll) {
      await onAdminEnroll(course.id);
      return;
    }
    // Regular click handler
    onClick?.();
  };

  return (
    <Card className="nb-tap flex flex-col overflow-hidden hover:shadow-lg transition-shadow duration-300 border-border/50">
      
      {/* Course Image */}
      <div className="relative h-48 w-full overflow-hidden bg-muted">
        <SmartImage
          src={course.image_url || coursePlaceholder}
          alt={course.title}
          width={600}
          height={384}
          fallbackSrc={coursePlaceholder}
          className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
        />
        <div className="absolute top-2 right-2 flex gap-2">
          {course.price === 0 && (
            <Badge className="bg-green-500 text-white">FREE</Badge>
          )}
          {isEnrolled && (
            <Badge className="bg-primary text-primary-foreground gap-1">
              <CheckCircle className="h-3 w-3" />
              Enrolled
            </Badge>
          )}
          <Badge variant="secondary" className="backdrop-blur-md bg-background/80">
            Grade {course.grade}
          </Badge>
        </div>
      </div>

      {/* Card Content */}
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-bold text-lg line-clamp-1">{course.title}</h3>
          <div className="flex items-center text-yellow-500 text-xs font-medium">
            <Star className="h-3 w-3 fill-current mr-1" />
            <span>{course.rating || "4.5"}</span>
          </div>
        </div>
        <p className="text-muted-foreground text-sm line-clamp-2 h-10">
          {course.description || "No description provided."}
        </p>
      </CardHeader>

      <CardContent className="p-4 pt-0 flex-1">
        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-4">
          <div className="flex items-center gap-1">
            <BookOpen className="h-3 w-3" />
            <span>{course.lessons_count || 0} Lessons</span>
          </div>
          {course.duration && course.duration !== "0m" && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{course.duration}</span>
            </div>
          )}
        </div>
      </CardContent>

      {/* Footer / Buttons */}
      <CardFooter className="p-4 border-t bg-muted/20 flex items-center justify-between gap-2">
        <div className="text-lg font-bold text-primary">
          {course.price === 0 ? "Free" : `₹${course.price}`}
        </div>
        <div className="flex gap-2">
          {/* Free course: show Enroll button if not enrolled */}
          {course.price === 0 && !isEnrolled && onEnrollFree && (
            <Button size="sm" variant="default" onClick={(e) => { e.stopPropagation(); onEnrollFree(); }}>
              Enroll Free
            </Button>
          )}
          <Button size="sm" variant={isEnrolled ? "secondary" : "default"} onClick={handleClick} disabled={isEnrolling}>
            {isEnrolling ? (
              "Enrolling..."
            ) : isAdmin && course.price > 0 ? (
              "Admin Access"
            ) : isEnrolled ? (
              "Continue Learning"
            ) : course.price === 0 ? (
              "Start Learning"
            ) : (
              "Buy Course"
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default CourseCard;
