import { useState } from 'react';
import { renderText } from '../utils/latex.jsx';

export default function FlashCard({ card, onRate }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');

  function handleReveal() {
    setShowAnswer(true);
  }

  function handleRate(rating) {
    onRate(rating, userAnswer);
    setShowAnswer(false);
    setUserAnswer('');
  }

  return (
    <div className="flashcard-shell">
      <div className="flashcard flashcard-narrow">
        <div className="flashcard-front">
          <div className="flashcard-label">Question</div>
          <p className="flashcard-text">{renderText(card.front)}</p>

          {!showAnswer && (
            <div className="answer-area">
              <textarea
                className="answer-input"
                placeholder="Your answer..."
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                rows={4}
              />
              <button className="btn-reveal" onClick={handleReveal}>
                Show Answer
              </button>
            </div>
          )}

          {showAnswer && (
            <div className="answer-reveal">
              <div className="flashcard-label">Your answer</div>
              <p className="flashcard-text user-answer-text">
                {userAnswer || <em>(no answer entered)</em>}
              </p>
              <div className="flashcard-divider" />
              <div className="flashcard-label">Correct answer</div>
              <p className="flashcard-text correct-answer-text">
                {renderText(card.back)}
              </p>
            </div>
          )}
        </div>

        {showAnswer && (
          <div className="rating-buttons">
            <button className="rate-btn rate-again" onClick={() => handleRate(0)}>
              <span className="rate-label">Again</span>
              <span className="rate-sub">1 day</span>
            </button>
            <button className="rate-btn rate-hard" onClick={() => handleRate(1)}>
              <span className="rate-label">Hard</span>
              <span className="rate-sub">~2 days</span>
            </button>
            <button className="rate-btn rate-good" onClick={() => handleRate(2)}>
              <span className="rate-label">Good</span>
              <span className="rate-sub">~4 days</span>
            </button>
            <button className="rate-btn rate-easy" onClick={() => handleRate(3)}>
              <span className="rate-label">Easy</span>
              <span className="rate-sub">~7 days</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
