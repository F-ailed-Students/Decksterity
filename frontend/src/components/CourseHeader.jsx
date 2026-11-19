import { BookOpen } from 'lucide-react'

export default function CourseHeader({ course }) {
  return (
    <div className="course-detail-header" style={{ '--accent': course.color }}>
      <div className="course-detail-icon">
        <BookOpen size={28} />
      </div>
      <div>
        <h1 className="course-detail-name">{course.name}</h1>
        <p className="course-detail-desc">{course.description}</p>
      </div>
    </div>
  )
}
