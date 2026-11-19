import { ArrowLeft, Moon, Sun } from 'lucide-react'

export default function StudyHeader({
  courseName,
  index,
  total,
  dark,
  onToggleTheme,
  onBack,
}) {
  return (
    <>
      <div className="study-header">
        <button
          type="button"
          className="btn-back btn-back-study"
          onClick={onBack}
        >
          <ArrowLeft size={16} />
        </button>
        <span className="study-course-name">{courseName}</span>
        <button
          type="button"
          className="theme-toggle-study"
          onClick={onToggleTheme}
        >
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <span className="study-counter">
          {index + 1} / {total}
        </span>
      </div>

      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>
    </>
  )
}
