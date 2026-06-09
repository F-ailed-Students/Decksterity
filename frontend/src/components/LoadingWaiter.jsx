import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import CourseCard from '../components/CourseCard';
import { useState, useEffect } from 'react';

export default function LoadingWaiter({ loading, error, children }) {
  if (loading)
    return (<div className="loading-indicator">Loading courses…</div>);
  if (error)
    return (<div className="error-message">⚠ {error}</div>);
  return children;
}