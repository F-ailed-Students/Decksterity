export default function LoadingWaiter({ loading, error, children }) {
  if (loading)
    return (<div className="loading-indicator">Loading…</div>);
  if (error)
    return (<div className="error-message">⚠ {error}</div>);
  return children;
}