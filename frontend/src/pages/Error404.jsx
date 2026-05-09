import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import FlashCard from '../components/FlashCard';
import { getCourse, getDueCards, getNewCards, rateCard } from '../store';
import { ArrowLeft, CheckCircle, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeProvider';

export default function Error404() {
  const { dark, toggle } = useTheme();
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
