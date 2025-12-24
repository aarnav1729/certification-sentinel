import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { FileCheck, Settings, Sun } from 'lucide-react';

export const AppHeader = () => {
  const location = useLocation();

  const navItems = [
    { href: '/', label: 'Certifications', icon: FileCheck },
    { href: '/settings', label: 'Email Settings', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="h-9 w-9 rounded-lg gradient-primary flex items-center justify-center shadow-md group-hover:shadow-glow transition-shadow">
                <Sun className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-display font-semibold text-lg">
                CertTracker
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span>Notifications Active</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
