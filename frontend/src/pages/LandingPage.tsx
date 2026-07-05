import { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { GoogleLogin } from '@react-oauth/google';
import type { CredentialResponse } from '@react-oauth/google';
import { Bot, Calendar, Mail, Shield, Moon, Sun } from 'lucide-react';
import toast from 'react-hot-toast';


function DriftingParticles() {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (groupRef.current) {
      
      groupRef.current.rotation.y = state.clock.getElapsedTime() * 0.02;
      groupRef.current.rotation.x = state.clock.getElapsedTime() * 0.01;
    }
  });

  return (
    <group ref={groupRef}>
      <Stars radius={100} depth={50} count={6000} factor={3} saturation={0} fade speed={0.5} />
    </group>
  );
}


const INTRO_TEXT = "Hello. I am Jarvis, Mithelesh's Personal AI Assistant and Digital Twin. I can manage his calendar, send emails, and represent him professionally.";

function useTypewriter(text: string, speed = 40) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);
  return { displayed, done };
}

// ─── Main Landing Page ──────────────────────────────────────────────────────
export function LandingPage() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { displayed, done } = useTypewriter(INTRO_TEXT);

  const handleLoginSuccess = async (response: CredentialResponse) => {
    if (!response.credential) return;
    setIsLoggingIn(true);
    try {
      await login(response.credential);
    } catch {
      toast.error('Authentication failed. Please try again.');
      setIsLoggingIn(false);
    }
  };

  const features = [
    { icon: <Calendar className="w-5 h-5 text-electricBlue" />, label: 'Calendar Management' },
    { icon: <Mail className="w-5 h-5 text-electricBlue" />, label: 'Email Delegation' },
    { icon: <Shield className="w-5 h-5 text-electricBlue" />, label: 'Secure MCP Architecture' },
  ];

  return (
    <div className="h-[100dvh] overflow-hidden bg-slate-950 text-slate-50 flex flex-col relative">
      
      {}
      <div className="absolute inset-0 z-0 opacity-60">
        <Canvas camera={{ position: [0, 0, 1] }}>
          <DriftingParticles />
        </Canvas>
      </div>

      {}
      <nav className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-800/40 bg-slate-950/60 backdrop-blur-md z-20">
        <div className="flex items-center space-x-2.5">
          <Bot className="w-7 h-7 text-electricBlue" />
          <span className="text-lg font-bold tracking-tight">Jarvis AI</span>
          <span className="hidden sm:inline-flex items-center space-x-1 ml-2 bg-slate-800/80 rounded-full px-2.5 py-0.5 border border-slate-700/60">
            <span className="w-1.5 h-1.5 rounded-full bg-electricBlue animate-pulse" />
            <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest">MCP + Gemini</span>
          </span>
        </div>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full text-slate-400 hover:text-electricBlue hover:bg-slate-800/80 transition-colors focus:outline-none focus:ring-2 focus:ring-electricBlue"
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </nav>

      {}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 z-10 overflow-hidden">
        
        {}
        <div className="flex flex-col justify-center items-center lg:items-end px-8 py-10 lg:pr-16 lg:border-r border-slate-800/50">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="w-full max-w-md flex flex-col space-y-8"
          >
            {}
            <div className="text-left">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight mb-3">
                Mithelesh's AI-Powered<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-electricBlue to-blue-400">
                  Executive Assistant
                </span>
              </h1>
              <p className="text-slate-400 text-sm">
                Manage calendars, schedule slots, and delegate notifications autonomously.
              </p>
            </div>

            {}
            <div className="w-full flex flex-col space-y-3 bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-800/80 shadow-2xl">
              {isLoggingIn ? (
                <div className="flex items-center justify-center space-x-3 py-2 text-slate-400">
                  <div className="w-5 h-5 border-2 border-electricBlue border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium">Authenticating...</span>
                </div>
              ) : (
                <div className="w-full flex justify-center py-2">
                  <GoogleLogin
                    onSuccess={handleLoginSuccess}
                    onError={() => toast.error('Google login failed. Please try again.')}
                    useOneTap
                    theme="filled_black"
                    size="large"
                    shape="pill"
                    text="signin_with"
                  />
                </div>
              )}
              <p className="text-xs text-slate-500 text-center">
                Authenticate via Google to start booking meetings and managing delegative tasks.
              </p>
            </div>

            {}
            <div className="flex flex-col space-y-3">
              {features.map((f, i) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  key={f.label}
                  className="flex items-center space-x-4 bg-slate-900/40 border border-slate-800/40 rounded-2xl px-5 py-3 hover:bg-slate-800/60 transition-colors backdrop-blur-sm"
                >
                  {f.icon}
                  <span className="text-sm font-medium text-slate-300">{f.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {}
        <div className="flex flex-col justify-center items-center lg:items-start px-8 py-10 lg:pl-16 relative">
          {}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-electricBlue/10 blur-[100px] rounded-full pointer-events-none" />
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="w-full max-w-xl z-10"
          >
            <p
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-200 to-slate-500 leading-[1.3] drop-shadow-sm min-h-[12rem] lg:min-h-[16rem]"
              aria-live="polite"
              aria-label="Jarvis introduction"
            >
              {displayed}
              {!done && <span className="text-electricBlue animate-pulse inline-block ml-1">_</span>}
            </p>
          </motion.div>
        </div>

      </main>
    </div>
  );
}
