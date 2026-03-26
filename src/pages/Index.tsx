import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Logo from '@/components/Logo';
import { isNativePlatform } from '@/hooks/usePlatform';
import Landing from './Landing';

const Index = () => {
  const navigate = useNavigate();
  const isNative = isNativePlatform();

  useEffect(() => {
    // Native app goes straight to login
    if (isNative) {
      const timer = setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [navigate, isNative]);

  // Web users see the landing page
  if (!isNative) {
    return <Landing />;
  }

  // Native users see the splash screen briefly
  return (
    <div className="min-h-screen care-gradient flex flex-col items-center justify-center p-6">
      <Logo size="lg" variant="light" />
      <p className="text-white/70 mt-8 animate-pulse">Loading...</p>
    </div>
  );
};

export default Index;
