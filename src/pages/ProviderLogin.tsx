import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Logo from '@/components/Logo';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ProviderLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    // Check that this user has a provider application
    const { data: application } = await supabase
      .from('provider_applications')
      .select('status')
      .eq('user_id', data.user.id)
      .maybeSingle();
    if (!application) {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error('No provider application found. Please register first.');
      return;
    }
    if (application.status === 'pending') {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error('Your application is still under review. You will be notified once approved.');
      return;
    }
    if (application.status === 'rejected') {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error('Your application has been rejected. Please contact support for more information.');
      return;
    }
    setLoading(false);
    navigate('/provider-dashboard');
  };

  return (
    <div className="min-h-screen care-gradient flex flex-col items-center justify-center p-6">
      <div className="mb-8">
        <Logo size="lg" variant="light" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-8 tracking-wide">PROVIDER LOGIN</h1>
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-6">
        <div>
          <label className="block text-white/80 text-sm mb-2 uppercase tracking-wide">Email</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="care-input text-white border-white/30 bg-transparent placeholder:text-white/50"
            placeholder="Enter your email"
            required
          />
        </div>
        <div>
          <label className="block text-white/80 text-sm mb-2 uppercase tracking-wide">Password</label>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="care-input text-white border-white/30 bg-transparent placeholder:text-white/50 pr-10"
              placeholder="Enter your password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-white text-primary hover:bg-white/90 font-semibold py-6"
        >
          {loading ? 'Logging in...' : 'Login'}
        </Button>

        {/* Forgot Password */}
        <div className="text-center space-y-2">
          <a
            href="mailto:support@easycare.live?subject=Password Reset Request&body=Please reset the password for my provider account. My email is: "
            className="text-white/80 hover:text-white text-sm font-medium block"
          >
            Forgot your password?
          </a>
          <p className="text-white/50 text-xs">
            Contact us at support@easycare.live and we'll reset it within 24 hours.
          </p>
        </div>

        <p className="text-center text-white/70 text-sm">
          Don't have an account?{' '}
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="text-accent hover:text-accent/80 font-semibold"
          >
            Register Now
          </button>
        </p>
      </form>
    </div>
  );
};

export default ProviderLogin;
