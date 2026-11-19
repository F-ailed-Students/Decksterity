import { CheckCircle } from 'lucide-react'

export default function StudySummary({
  courseName,
  studied,
  againCount,
  onBackToCourse,
  onAllCourses,
}) {
  return (
    <div className="app-shell">
      <main className="main-content">
        <div className="done-screen">
          <div className="done-icon">
            <CheckCircle size={56} />
          </div>
          <h1 className="done-title">Session complete!</h1>
          <p className="done-subtitle">
            You studied <strong>{studied}</strong> {studied === 1 ? 'card' : 'cards'} from {courseName}
          </p>
          <div className="done-stats">
            <div className="done-stat">
              <span className="done-stat-value">{studied - againCount}</span>
              <span className="done-stat-label">remembered</span>
            </div>
            <div className="done-stat">
              <span className="done-stat-value">{againCount}</span>
              <span className="done-stat-label">need review</span>
            </div>
          </div>
          <div className="done-actions">
            <button type="button" className="btn-primary" onClick={onBackToCourse}>
              Back to course
            </button>
            <button type="button" className="btn-secondary" onClick={onAllCourses}>
              All courses
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
