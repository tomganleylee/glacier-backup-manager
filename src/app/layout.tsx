'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, FolderOpen, Tv, Film, ShieldCheck, Download,
  RefreshCw, ClipboardList, Bot, Settings, Snowflake, Sun, Zap
} from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/files', label: 'File Browser', icon: FolderOpen },
  { href: '/shows', label: 'Shows', icon: Tv },
  { href: '/movies', label: 'Movies', icon: Film },
  { href: '/backed-up', label: 'Backed Up', icon: ShieldCheck },
  { href: '/restore', label: 'Restore', icon: Download },
  { href: '/transcode', label: 'Transcode', icon: RefreshCw },
  { href: '/manifest', label: 'Manifest', icon: ClipboardList },
  { href: '/assistant', label: 'AI Assistant', icon: Bot },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function NavLink({ href, label, icon: Icon, active }: {
  href: string; label: string; icon: React.ElementType; active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        'flex items-center gap-3 px-3 py-2 text-sm rounded-[var(--radius-sm)] transition-all duration-150 group ' +
        (active
          ? 'bg-[var(--nav-active-bg)] text-[var(--accent)] border-l-2 border-[var(--nav-active-border)] pl-[10px]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)] border-l-2 border-transparent pl-[10px]')
      }
    >
      <Icon size={18} strokeWidth={active ? 2 : 1.5} className={active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'} />
      <span className={active ? 'font-medium' : ''}>{label}</span>
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<'clean' | 'cyberpunk'>('clean');

  useEffect(() => {
    const saved = localStorage.getItem('glacier-theme') as 'clean' | 'cyberpunk' | null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'cyberpunk' ? 'cyberpunk' : '');
    localStorage.setItem('glacier-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'clean' ? 'cyberpunk' : 'clean');

  return (
    <html lang="en" data-theme={theme === 'cyberpunk' ? 'cyberpunk' : undefined}>
      <head>
        <title>Glacier Backup Manager</title>
        <meta name="description" content="NAS backup management for AWS S3 Glacier Deep Archive" />
      </head>
      <body style={{ background: 'var(--bg)', color: 'var(--text)' }}>
        <div className="flex h-screen">
          {/* Sidebar */}
          <aside className="w-60 flex flex-col border-r" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            {/* Brand */}
            <div className="px-4 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
                  <Snowflake size={18} style={{ color: 'var(--accent)' }} />
                </div>
                <div>
                  <h1 className="text-sm font-bold neon-text glitch-text" data-text="Glacier Backup" style={{ color: 'var(--accent)', fontFamily: 'var(--font-heading)' }}>Glacier Backup</h1>
                  <p className="text-[11px] blink-cursor" style={{ color: 'var(--text-dim)' }}>NAS Manager</p>
                </div>
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
              {navItems.map(item => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))}
                />
              ))}
            </nav>

            {/* Footer */}
            <div className="p-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[11px] font-mono" style={{ color: 'var(--text-dim)', letterSpacing: '0.05em' }}>v0.1.0</span>
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-[var(--radius-xs)] transition-colors hover:bg-[var(--bg-elevated)]"
                title={theme === 'cyberpunk' ? 'Switch to clean theme' : 'Switch to cyberpunk theme'}
              >
                {theme === 'cyberpunk'
                  ? <Sun size={14} style={{ color: 'var(--warning)' }} />
                  : <Zap size={14} style={{ color: 'var(--text-muted)' }} />
                }
              </button>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-auto">
            <div className="p-6 max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
