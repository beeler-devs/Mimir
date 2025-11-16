'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, Button, Dropdown, DropdownOption } from '@/components/common';
import { ThemePreference, LearningMode } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useDefaultLearningMode, getAllLearningModes } from '@/lib/learningMode';
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
  { id: 'personalization', label: 'Personalization', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'apps', label: 'Apps & Connectors', icon: AppWindow },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'parental', label: 'Parental controls', icon: UserCog },
  { id: 'language', label: 'Language', icon: Globe },
  { id: 'advanced', label: 'Advanced', icon: SlidersHorizontal },
] as const;

type MenuItemId = typeof menuItems[number]['id'];

interface ToggleControlProps {
  value: boolean;
  onChange: (next: boolean) => void;
}

const ToggleControl: React.FC<ToggleControlProps> = ({ value, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    className={`h-6 w-11 rounded-full transition-colors flex items-center ${value ? 'bg-primary' : 'bg-muted'}`}
  >
    <span
      className={`
        block h-5 w-5 bg-background rounded-full shadow-sm transition-transform
        ${value ? 'translate-x-5' : 'translate-x-0.5'}
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

const themeOptions: DropdownOption[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const accentColorOptions: DropdownOption[] = [
  { value: 'default', label: 'Default' },
  { value: 'violet', label: 'Violet' },
  { value: 'emerald', label: 'Emerald' },
  { value: 'sky', label: 'Sky' },
];

/**
 * Settings modal inspired by the reference screenshot
 */
export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  theme,
  onThemeChange,
}) => {
  const [activeMenu, setActiveMenu] = useState<MenuItemId>('general');
  const [showAdditionalModels, setShowAdditionalModels] = useState(false);
  const [accent, setAccent] = useState('default');
  const { signOut } = useAuth();
  const router = useRouter();
  
  // Learning mode state
  const [defaultLearningMode, setDefaultLearningMode] = useDefaultLearningMode();
  const allModes = getAllLearningModes();

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
        <div className="w-64 border-r border-border bg-card/80 p-4 flex flex-col">
          <div className="flex-1 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = activeMenu === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveMenu(item.id)}
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

          <div className="pt-4 border-t border-border">
            <Button
              variant="destructive"
              className="w-full gap-2"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </div>

        <div className="flex-1 p-8 space-y-8 overflow-y-auto">
          {/* General Tab */}
          {activeMenu === 'general' && (
            <>
              <div>
                <h2 className="text-2xl font-semibold">General</h2>
              </div>

              <section className="space-y-4">
                <div className="flex items-center justify-between gap-6">
                  <p className="font-semibold">Appearance</p>
                  <Dropdown
                    options={themeOptions}
                    value={theme}
                    onChange={(value) => onThemeChange(value as ThemePreference)}
                    ariaLabel="Select theme"
                  />
                </div>

                <div className="flex items-center justify-between gap-6 py-4 border-t border-border">
                  <p className="font-semibold">Accent color</p>
                  <Dropdown
                    options={accentColorOptions}
                    value={accent}
                    onChange={setAccent}
                    ariaLabel="Select accent color"
                  />
                </div>

                <div className="flex items-center justify-between gap-6 border-t border-border pt-4">
                  <p className="font-semibold">Show additional models</p>
                  <ToggleControl value={showAdditionalModels} onChange={setShowAdditionalModels} />
                </div>
              </section>
            </>
          )}

          {/* Personalization Tab */}
          {activeMenu === 'personalization' && (
            <>
              <div>
                <h2 className="text-2xl font-semibold">Personalization</h2>
                <p className="text-sm text-muted-foreground">Customize how Mimir teaches and interacts with you.</p>
              </div>

              <section className="space-y-4">
                <div>
                  <p className="font-semibold mb-2">Default Learning Mode</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Choose your preferred teaching style. You can override this for specific questions in the chat.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {allModes.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setDefaultLearningMode(mode.id)}
                        className={`
                          border rounded-2xl p-4 text-left transition-colors
                          ${defaultLearningMode === mode.id
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/60'
                          }
                        `}
                      >
                        <p className="font-medium">{mode.name}</p>
                        <p className="text-sm text-muted-foreground mt-1">{mode.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}

          {/* Other tabs placeholder */}
          {activeMenu !== 'general' && activeMenu !== 'personalization' && (
            <div>
              <h2 className="text-2xl font-semibold capitalize">{activeMenu}</h2>
              <p className="text-sm text-muted-foreground mt-2">Coming soon...</p>
            </div>
          )}

          <div className="flex justify-end items-center pt-6 border-t border-border">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
