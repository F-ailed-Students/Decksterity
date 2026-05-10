# Spaced Repetition Flashcard App

A full-stack web application for creating and studying flashcards using spaced repetition algorithms to optimize learning retention.

## Overview

This application combines a modern React frontend with a FastAPI backend to provide an efficient study platform. Users can create flashcards, organize them into courses, and study using scientifically-proven spaced repetition techniques powered by the FSRS (Forgetting Curve Spaced Repetition System).

## Features

- **User Authentication**: Register and login with email and password
- **Course Management**: Create courses (educators only) and join courses with class codes
- **Flashcard Management**: 
  - Create and edit personal flashcards
  - Delete local flashcards
  - Promote flashcards to public cards (educators only)
  - Support for mathematical notation using LaTeX
- **Spaced Repetition**: Optimized learning schedule based on FSRS algorithm
- **Role-Based Access**: Different permissions for regular users and educators

## Tech Stack

### Backend
- **Framework**: FastAPI
- **Server**: Uvicorn
- **Spaced Repetition**: FSRS (Forgetting Curve Spaced Repetition System)
- **Language**: Python 3

### Frontend
- **Framework**: React 19
- **Build Tool**: Vite
- **Routing**: React Router DOM
- **HTTP Client**: Axios
- **Math Rendering**: KaTeX
- **Icons**: Lucide React
- **Styling**: CSS

## Project Structure

```
.
├── backend/                    # FastAPI backend server
│   ├── app/
│   │   ├── algorithm_and_deck.py
│   │   ├── db.py
│   │   └── Deck.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # React frontend application
│   ├── src/
│   │   ├── components/        # Reusable React components
│   │   ├── context/           # Context providers (Auth, Theme)
│   │   ├── pages/             # Page components
│   │   ├── utils/             # Utility functions
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── store.js
│   ├── public/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   └── nginx.conf
├── podman-compose.yml         # Docker Compose configuration
└── Specification.txt          # API specifications
```

## Getting Started

### Prerequisites
- Python 3.9+
- Node.js 16+
- npm or yarn
- Docker and Docker Compose (optional)

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the development server:
```bash
uvicorn app.main:app --reload
```

The backend will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

### Docker Setup

To run the entire application using Docker Compose:

```bash
docker-compose -f podman-compose.yml up
```

This will start both the backend and frontend in containerized environments.

## Available Scripts

### Frontend
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint to check code quality

### Backend
- `uvicorn app.main:app --reload` - Start development server with auto-reload

## API Endpoints

### Authentication
- `POST /login` - Authenticate user (returns access token)
- `POST /register` - Create new user account
- `POST /auto-login` - Auto-login with access token

### Courses
- `POST /courses` - Create a new course (educators only)
- `POST /courses/join` - Join an existing course

### Flashcards
- `POST /cards` - Create a new flashcard
- `PUT /cards/{id}` - Edit a flashcard
- `DELETE /cards/{id}` - Delete a flashcard
- `POST /cards/{id}/promote` - Promote to public card (educators only)

## Components

### Frontend Components
- **AccountMenu** - User account dropdown menu
- **CourseCard** - Course display component
- **FlashCard** - Individual flashcard display
- **Sidebar** - Navigation sidebar
- **AuthProvider** - Authentication context
- **ThemeProvider** - Theme context

### Pages
- **Login** - User login page
- **Dashboard** - Main dashboard with courses
- **CourseDetail** - Course details and flashcards
- **Study** - Study interface for learning
- **Editor** - Flashcard editor
- **Error404** - 404 error page

## Contributing

Contributions are welcome! Please ensure code follows the ESLint rules defined in the project.

## License

See [LICENSE](LICENSE) file for details.

## Development Notes

- Mathematical notation in flashcards is supported using KaTeX
- The FSRS algorithm optimizes review schedules based on user performance
- Authentication uses token-based sessions with cookies
