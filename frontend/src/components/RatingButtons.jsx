const RATINGS = [
  { value: 0, label: 'Again', sub: '1 day', className: 'rate-again' },
  { value: 1, label: 'Hard', sub: '~2 days', className: 'rate-hard' },
  { value: 2, label: 'Good', sub: '~4 days', className: 'rate-good' },
  { value: 3, label: 'Easy', sub: '~7 days', className: 'rate-easy' },
]

export default function RatingButtons({ onRate }) {
  return (
    <div className="rating-buttons">
      {RATINGS.map((rating) => (
        <button
          key={rating.value}
          type="button"
          className={`rate-btn ${rating.className}`}
          onClick={() => onRate(rating.value)}
        >
          <span className="rate-label">{rating.label}</span>
          <span className="rate-sub">{rating.sub}</span>
        </button>
      ))}
    </div>
  )
}
