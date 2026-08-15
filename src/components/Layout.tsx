import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../lib/supabase';
import { Cpu, Menu, X } from 'lucide-react';
import { useState } from 'react';

const links = [
  { to: '/calculator', label: 'Calculator' },
  { to: '/gpus', label: 'GPU library' },
  { to: '/models', label: 'Models' },
  { to: '/guide', label: 'Method' },
];

export default function Layout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-ink text-paper">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-ink/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <span className="h-8 w-8 rounded-md bg-ink-2 hairline grid place-items-center text-copper">
              <Cpu size={16} />
            </span>
            <span className="display text-[1.35rem] tracking-tight leading-none">
              Lattice<span className="text-copper">.</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-[13px]">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-full transition ${
                    isActive ? 'bg-panel text-paper' : 'text-mist hover:text-paper'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
            {user && (
              <>
                <NavLink to="/history" className={({ isActive }) => `px-3 py-1.5 rounded-full ${isActive ? 'bg-panel' : 'text-mist hover:text-paper'}`}>History</NavLink>
                <NavLink to="/profiles" className={({ isActive }) => `px-3 py-1.5 rounded-full ${isActive ? 'bg-panel' : 'text-mist hover:text-paper'}`}>Rigs</NavLink>
              </>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden sm:block text-[11px] text-mist max-w-[140px] truncate mono">{user.email}</span>
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="text-[12px] px-3 py-1.5 rounded-full border border-line hover:border-copper/50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="text-[12px] px-3.5 py-1.5 rounded-full bg-copper text-ink font-medium hover:bg-copper-2"
              >
                Sign in
              </Link>
            )}
            <button className="md:hidden p-2 text-mist" onClick={() => setOpen((v) => !v)} aria-label="Menu">
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {open && (
          <div className="md:hidden border-t border-line bg-ink-2 px-4 py-3 flex flex-col gap-1">
            {[...links, ...(user ? [{ to: '/history', label: 'History' }, { to: '/profiles', label: 'Rigs' }] : [])].map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className={`py-2 text-sm ${loc.pathname === l.to ? 'text-copper' : 'text-mist'}`}>
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line mt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 grid sm:grid-cols-3 gap-8 text-sm">
          <div>
            <p className="display text-2xl">Lattice.</p>
            <p className="text-mist mt-2 max-w-xs leading-relaxed">
              Hardware math for local inference. Active vs total parameters, KV cache, and the quant that actually fits.
            </p>
          </div>
          <div className="text-mist space-y-1.5">
            <p className="text-paper text-xs tracking-[0.18em] uppercase mb-2">Navigate</p>
            <Link to="/calculator" className="block hover:text-paper">Calculator</Link>
            <Link to="/gpus" className="block hover:text-paper">GPU library</Link>
            <Link to="/models" className="block hover:text-paper">Models</Link>
            <Link to="/guide" className="block hover:text-paper">Methodology</Link>
          </div>
          <div className="text-mist text-xs leading-relaxed">
            <p className="text-paper text-xs tracking-[0.18em] uppercase mb-2">Disclaimer</p>
            Estimates are first-order: memory-bound decode, published bandwidth, and typical runtime overhead.
            Real tokens/sec vary with kernels, batching, and thermals. Always measure on your box.
          </div>
        </div>
      </footer>
    </div>
  );
}
