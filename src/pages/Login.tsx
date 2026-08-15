import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { signInWithGoogle } from '../lib/googleAuth';
import supabase from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { user, loading } = useAuth();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('password123');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={loc.state?.from || '/calculator'} replace />;

  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email.trim() || password.length < 6) {
      setError('Use a valid email and a password of at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      if (isSignUp) {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        setInfo('Account created. You can sign in now.');
        setIsSignUp(false);
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[80vh] grid lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <img src="/images/lab-desk.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-ink/55" />
        <div className="absolute bottom-10 left-10 right-10">
          <p className="display text-5xl">Keep your rigs.</p>
          <p className="text-mist mt-3 max-w-sm">Save GPU profiles and calculation history so the next 671B drop is a 30-second check, not a spreadsheet.</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <p className="mono text-[11px] tracking-[0.22em] uppercase text-copper">Account</p>
          <h1 className="display text-4xl mt-2">{isSignUp ? 'Create a bench' : 'Sign in'}</h1>
          <p className="text-mist text-sm mt-2">Demo: demo@example.com / password123</p>

          <form onSubmit={handleEmailAuth} className="mt-8 space-y-3">
            <label className="block text-xs text-mist">Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full bg-ink-2 hairline rounded-xl px-3 py-2.5 text-sm outline-none focus:border-copper/60" />
            </label>
            <label className="block text-xs text-mist">Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full bg-ink-2 hairline rounded-xl px-3 py-2.5 text-sm outline-none focus:border-copper/60" />
            </label>
            {error && <p className="text-rose text-sm">{error}</p>}
            {info && <p className="text-ok text-sm">{info}</p>}
            <button type="submit" disabled={busy} className="w-full bg-copper text-ink rounded-full py-2.5 text-sm font-medium disabled:opacity-50">
              {busy ? 'Working…' : isSignUp ? 'Sign up' : 'Sign in'}
            </button>
          </form>

          <div className="my-5 text-center text-mist text-xs tracking-widest uppercase">or</div>

          <button
            onClick={() => signInWithGoogle('Lattice')}
            className="w-full hairline rounded-full py-2.5 text-sm hover:border-copper/50 flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.1 14.6 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z" />
            </svg>
            Sign in with Google
          </button>

          <button onClick={() => { setIsSignUp((v) => !v); setError(''); }} className="mt-6 text-sm text-mist hover:text-paper">
            {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
          </button>
        </div>
      </div>
    </div>
  );
}
