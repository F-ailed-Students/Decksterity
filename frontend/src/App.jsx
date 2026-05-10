import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import CourseDetail from './pages/CourseDetail';
import Study from './pages/Study';
import './index.css';
import Login from './pages/Login';
import Editor from './pages/Editor';
import Error404 from './pages/Error404';
import { ThemeProvider } from './context/ThemeProvider';
import { AuthProvider } from './context/AuthProvider';
import AccountMenu from './components/AccountMenu';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AccountMenu />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Dashboard />} />
            <Route path="/courses/:id" element={<CourseDetail />} />
            <Route path="/courses/:id/edit" element={<Editor />} />
            <Route path="/study/:id" element={<Study />} />
            <Route path="/404" element={<Error404 />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
