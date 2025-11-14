'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, Button } from '@/components/common';
import { ThemePreference } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import {
  Settings,
  Bell,
  Palette,
  AppWindow,
  Shield,
  UserCog,
  Globe,
  SlidersHorizontal,
  LogOut,
} from 'lucide-react';

const menuItems = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'personalization', label: 'Personalization', icon: Palette },
  { id: 'apps', label: 'Apps & Connectors', icon: AppWindow },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'parental', label: 'Parental controls', icon: UserCog },
  { id: 'language', label: 'Language', icon: Globe },
  { id: 'advanced', label: 'Advanced', icon: SlidersHorizontal },
] as const;

interface ThemeOptionButtonProps {
  value: ThemePreference;
  label: string;
  description: string;
  activeTheme: ThemePreference;
  onChange: (theme: ThemePreference) => void;
}

const ThemeOptionButton: React.FC<ThemeOptionButtonProps> = ({
  value,
  label,
  description,
  activeTheme,
  onChange,
}) => {
  const selected = activeTheme === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`
        flex-1 border rounded-2xl p-4 text-left
        ${selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/60'}
      `}
    >
      <p className="font-medium">{label}</p>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </button>
  );
};

interface ToggleControlProps {
  value: boolean;
  onChange: (next: boolean) => void;
}

const ToggleControl: React.FC<ToggleControlProps> = ({ value, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    className={`h-6 w-11 rounded-full transition-colors ${value ? 'bg-primary' : 'bg-muted'}`}
  >
    <span
      className={`
        block h-5 w-5 bg-background rounded-full shadow-sm transition-transform translate-y-0.5
        ${value ? 'translate-x-5' : 'translate-x-1'}
      `}
    />
  </button>
);

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}

/**
 * Settings modal inspired by the reference screenshot
 */
export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  theme,
  onThemeChange,
}) => {
  const [showAdditionalModels, setShowAdditionalModels] = useState(false);
  const [accent, setAccent] = useState('default');
  const { signOut } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut();
      router.push('/login');
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex h-[520px]">
        <div className="w-64 border-r border-border bg-card/80 p-4 space-y-1">
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            const active = index === 0;
            return (
              <button
                key={item.id}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors
                  ${active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}
                `}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 p-8 space-y-8 overflow-y-auto">
          <div>
            <h2 className="text-2xl font-semibold">General</h2>
            <p className="text-sm text-muted-foreground">Appearance and accessibility controls for Mimir.</p>
          </div>

          <section className="space-y-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="font-semibold">Appearance</p>
                <p className="text-sm text-muted-foreground">Choose how Mimir should look by default.</p>
              </div>
              <div className="flex gap-3 w-2/3">
                <ThemeOptionButton
                  value="system"
                  label="System"
                  description="Follow your OS preference"
                  activeTheme={theme}
                  onChange={onThemeChange}
                />
                <ThemeOptionButton
                  value="light"
                  label="Light"
                  description="Bright and clean interface"
                  activeTheme={theme}
                  onChange={onThemeChange}
                />
                <ThemeOptionButton
                  value="dark"
                  label="Dark"
                  description="Dimmed interface for focus"
                  activeTheme={theme}
                  onChange={onThemeChange}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-6 py-4 border-t border-border">
              <div>
                <p className="font-semibold">Accent color</p>
                <p className="text-sm text-muted-foreground">Tune highlight colors inside the app.</p>
              </div>
              <select
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
                className="px-4 py-2 rounded-xl border border-border bg-background"
              >
                <option value="default">Default</option>
                <option value="violet">Violet</option>
                <option value="emerald">Emerald</option>
                <option value="sky">Sky</option>
              </select>
            </div>

            <div className="flex items-center justify-between gap-6 border-t border-border pt-4">
              <div>
                <p className="font-semibold">Show additional models</p>
                <p className="text-sm text-muted-foreground">Display experimental or preview models in the AI side panel.</p>
              </div>
              <ToggleControl value={showAdditionalModels} onChange={setShowAdditionalModels} />
            </div>
          </section>

          <div className="flex justify-between items-center pt-6 border-t border-border">
            <Button
              variant="destructive"
              className="gap-2"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
