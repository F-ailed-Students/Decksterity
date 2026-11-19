import { useNavigate } from 'react-router-dom';

export default function Error404() {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <main className="error-404">
        <h1 style={{textAlign: 'center'}}>404 Not Found</h1>
        <button className="btn-back btn-back-study" onClick={() => navigate('/')}>
        Return
        </button>
      </main>
    </div>
  );
}
