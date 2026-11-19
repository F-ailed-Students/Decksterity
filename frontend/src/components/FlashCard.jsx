import { useState } from 'react'
import RatingButtons from './RatingButtons'
import { renderText } from '../utils/latex.jsx'

function AnswerForm({ value, onChange, onReveal }) {
  return (
    <div className="answer-area">
      <textarea
        className="answer-input"
        placeholder="Your answer..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
      />
      <button type="button" className="btn-reveal" onClick={onReveal}>
        Show Answer
      </button>
    </div>
  )
}

function AnswerReveal({ userAnswer, answer }) {
  return (
    <div className="answer-reveal">
      <div className="flashcard-label">Your answer</div>
      <p className="flashcard-text user-answer-text">
        {userAnswer || <em>(no answer entered)</em>}
      </p>
      <div className="flashcard-divider" />
      <div className="flashcard-label">Correct answer</div>
      <p className="flashcard-text correct-answer-text">{renderText(answer)}</p>
    </div>
  )
}

export default function FlashCard({ card, onRate }) {
  const [showAnswer, setShowAnswer] = useState(false)
  const [userAnswer, setUserAnswer] = useState('')

  function handleRate(rating) {
    onRate(rating, userAnswer)
    setShowAnswer(false)
    setUserAnswer('')
  }

  return (
    <div className="flashcard-shell">
      <div className="flashcard flashcard-narrow">
        <div className="flashcard-front">
          <div className="flashcard-label">Question</div>
          <p className="flashcard-text">{renderText(card.front)}</p>

          {showAnswer ? (
            <AnswerReveal userAnswer={userAnswer} answer={card.back} />
          ) : (
            <AnswerForm
              value={userAnswer}
              onChange={setUserAnswer}
              onReveal={() => setShowAnswer(true)}
            />
          )}
        </div>

        {showAnswer && <RatingButtons onRate={handleRate} />}
      </div>
    </div>
  )
}
