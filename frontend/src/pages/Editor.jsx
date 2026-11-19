import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getCourse, fetchCourses, addCard } from '../store';
import PageLayout from '../components/PageLayout';
import BackButton from '../components/BackButton';
import CourseHeader from '../components/CourseHeader';
import LoadingWaiter from '../components/LoadingWaiter';

export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');

  useEffect(() => {
    let active = true;

    fetchCourses()
      .then(() => {
        if (!active) return;

        const loadedCourse = getCourse(id);
        if (!loadedCourse) {
          setError('Course not found');
          return;
        }

        setCourse(loadedCourse);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  if (!course) {
    return (
      <PageLayout>
        <BackButton
          label="Back to course details"
          onClick={() => navigate(`/courses/${id}`)}
        />
        <LoadingWaiter loading={loading} error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <BackButton
        label="Back to course details"
        onClick={() => navigate(`/courses/${id}`)}
      />
      <CourseHeader course={course} />

      <div className="study-start-section">
        <h2 className="section-title">Add new card</h2>

        <textarea
          className="answer-input"
          placeholder="Question"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          rows={3}
        />

        <textarea
          className="answer-input"
          placeholder="Answer"
          value={newAnswer}
          onChange={(e) => setNewAnswer(e.target.value)}
          rows={5}
        />

        <button
          className="btn-primary"
          disabled={!newQuestion.trim() || !newAnswer.trim()}
          onClick={() => {
            addCard(course.id, newQuestion, newAnswer);
            setNewQuestion('');
            setNewAnswer('');
          }}
        >
          Save
        </button>
      </div>
    </PageLayout>
  );
}
