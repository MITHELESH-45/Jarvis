import { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, MeshDistortMaterial, Stars, Float } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

function Core() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.getElapsedTime() * 0.2;
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
      <Sphere ref={meshRef} args={[1.5, 64, 64]}>
        <MeshDistortMaterial 
          color="#00F0FF" 
          emissive="#00F0FF"
          emissiveIntensity={1.5}
          wireframe
          distort={0.4} 
          speed={2} 
          roughness={0.2}
          metalness={0.8}
        />
      </Sphere>
      
      {}
      <Sphere args={[1, 32, 32]}>
        <meshStandardMaterial 
          color="#ffffff" 
          emissive="#00F0FF"
          emissiveIntensity={2}
          transparent
          opacity={0.8}
        />
      </Sphere>
    </Float>
  );
}

function OrbitingRings() {
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ring1.current && ring2.current) {
      ring1.current.rotation.x = state.clock.getElapsedTime() * 0.5;
      ring1.current.rotation.y = state.clock.getElapsedTime() * 0.2;
      ring2.current.rotation.x = state.clock.getElapsedTime() * -0.3;
      ring2.current.rotation.z = state.clock.getElapsedTime() * 0.4;
    }
  });

  return (
    <>
      <mesh ref={ring1}>
        <torusGeometry args={[2.5, 0.02, 16, 100]} />
        <meshStandardMaterial color="#00F0FF" emissive="#00F0FF" emissiveIntensity={1} />
      </mesh>
      <mesh ref={ring2}>
        <torusGeometry args={[3, 0.02, 16, 100]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} opacity={0.5} transparent />
      </mesh>
    </>
  );
}

const TYPEWRITER_TEXT = "Hello. I am Jarvis, Mithelesh's Personal AI Assistant. I represent his digital twin. I can manage his calendar, drafts, and profile. Dismiss me when you are ready to begin.";

export function JarvisIntro() {
  const { setHasSeenIntro } = useAuth();
  const [displayedText, setDisplayedText] = useState("");
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  useEffect(() => {
    let i = 0;
    const typingInterval = setInterval(() => {
      if (i < TYPEWRITER_TEXT.length) {
        setDisplayedText(TYPEWRITER_TEXT.slice(0, i + 1));
        i++;
      } else {
        clearInterval(typingInterval);
        setIsTypingComplete(true);
      }
    }, 40); // typing speed

    return () => clearInterval(typingInterval);
  }, []);

  const handleDismiss = () => {
    setIsDismissing(true);
    setTimeout(() => {
      setHasSeenIntro(true);
    }, 1000); // Wait for fade out animation
  };

  return (
    <AnimatePresence>
      {!isDismissing && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
          transition={{ duration: 1 }}
          className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center overflow-hidden"
        >
          {}
          <div className="absolute inset-0 z-0">
            <Canvas camera={{ position: [0, 0, 7], fov: 45 }}>
              <ambientLight intensity={0.2} />
              <pointLight position={[10, 10, 10]} intensity={1} color="#00F0FF" />
              <pointLight position={[-10, -10, -10]} intensity={0.5} color="#ffffff" />
              
              <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
              
              <Core />
              <OrbitingRings />
              
              <OrbitControls 
                enableZoom={false} 
                enablePan={false}
                autoRotate 
                autoRotateSpeed={0.5} 
                maxPolarAngle={Math.PI / 2 + 0.2}
                minPolarAngle={Math.PI / 2 - 0.2}
              />
            </Canvas>
          </div>

          {}
          <div className="relative z-10 w-full max-w-3xl mx-auto px-6 text-center mt-[40vh] flex flex-col items-center">
            <div className="h-32 mb-8 flex items-end justify-center">
              <p className="text-xl md:text-2xl font-mono text-electricBlue drop-shadow-[0_0_10px_rgba(0,240,255,0.8)]">
                {displayedText}
                {!isTypingComplete && <span className="animate-pulse">_</span>}
              </p>
            </div>

            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: isTypingComplete ? 1 : 0, y: isTypingComplete ? 0 : 20 }}
              transition={{ duration: 0.5 }}
              onClick={handleDismiss}
              disabled={!isTypingComplete}
              className="px-8 py-3 bg-transparent border-2 border-electricBlue text-electricBlue font-bold rounded-full uppercase tracking-widest hover:bg-electricBlue hover:text-slate-900 transition-all duration-300 shadow-[0_0_15px_rgba(0,240,255,0.4)] hover:shadow-[0_0_25px_rgba(0,240,255,0.8)] disabled:opacity-0 disabled:cursor-default cursor-pointer"
            >
              Dismiss Core
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
