import { Suspense, lazy } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GoogleOAuthProvider } from '@react-oauth/google';

// Route-based code splitting: each page is loaded only when needed
const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const ChatPage    = lazy(() => import('./pages/ChatPage').then(m => ({ default: m.ChatPage })));

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-10 h-10 border-4 border-electricBlue border-t-transparent rounded-full animate-spin" />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

function AppContent() {
  const { user } = useAuth();

  return (
    <Suspense fallback={<LoadingScreen />}>
      {user ? <ChatPage /> : <LandingPage />}
    </Suspense>
  );
}

function App() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  return (
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={clientId}>
        <ThemeProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </ThemeProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  );
}

export default App;
