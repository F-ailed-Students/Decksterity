import { useNavigate } from 'react-router-dom';
import CourseCard from '../components/CourseCard';
import { getCourses, resetData } from '../store';
import { useState, useEffect } from 'react';

export default function Login() {
  return (
    <div className="app-shell">
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Login</h1>
            <textarea
                className="login-random-field"
                placeholder="Username"
                value={""}
                //onChange={(e) => setUserAnswer(e.target.value)}
                rows={4}
            />
        </div>
      </main>
    </div>
  );
}
