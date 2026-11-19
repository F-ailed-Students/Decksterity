const STATS = [
  { key: 'due', label: 'Cards due' },
  { key: 'new', label: 'New cards' },
  { key: 'total', label: 'Total cards' },
]

export default function CourseStats({ stats }) {
  return (
    <div className="course-stats-row">
      {STATS.map(({ key, label }) => (
        <div className="detail-stat" key={key}>
          <span className="detail-stat-value">{stats[key]}</span>
          <span className="detail-stat-label">{label}</span>
        </div>
      ))}
    </div>
  )
}
