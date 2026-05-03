import React from 'react';
import { AppSettings } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Moon, Sun, Bell, Clock, Info, ChevronRight, Monitor } from 'lucide-react';
import { cn } from '../lib/utils';
import { useSafeArea } from './SafeAreaProvider';

interface SettingsProps {
  settings: AppSettings;
  setSettings: (settings: Partial<AppSettings>) => void;
}

export default function Settings({ settings, setSettings }: SettingsProps) {
  const insets = useSafeArea();
  return (
    <div 
      style={{ paddingTop: `${insets.top + 32}px` }}
      className="px-6 flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 transition-colors duration-500 overflow-hidden"
    >
      <div className="mb-10">
        <h1 className="text-4xl font-serif font-medium tracking-tight">Settings</h1>
        <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.3em] mt-2">
          CONFIGURE YOUR UNIVERSE
        </p>
      </div>

      <div className="flex-1 space-y-12 overflow-y-auto no-scrollbar pb-32">
        {/* Appearance Section */}
        <section className="space-y-6">
          <SectionHeader title="Atmosphere" />
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-3 border border-zinc-200 dark:border-zinc-800 space-y-1 shadow-sm">
            <SettingRow 
              icon={<Sun className="w-4 h-4" />}
              label="Solar"
              isActive={settings.theme === 'light'}
              onClick={() => setSettings({ theme: 'light' })}
            />
            <SettingRow 
              icon={<Moon className="w-4 h-4" />}
              label="Lunar"
              isActive={settings.theme === 'dark'}
              onClick={() => setSettings({ theme: 'dark' })}
            />
            <SettingRow 
              icon={<Monitor className="w-4 h-4" />}
              label="Celestial"
              isActive={settings.theme === 'system'}
              onClick={() => setSettings({ theme: 'system' })}
            />
          </div>
        </section>

        {/* Notifications Section */}
        <section className="space-y-6">
          <SectionHeader title="Echoes" />
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border border-zinc-200 dark:border-zinc-800 space-y-8 shadow-sm">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="p-3 bg-orange-500/10 rounded-2xl text-orange-600">
                      <Bell className="w-5 h-5" />
                   </div>
                   <div>
                      <h4 className="text-sm font-serif font-medium">Daily Nudges</h4>
                      <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest leading-loose">Continuity reminders</p>
                   </div>
                </div>
                <button 
                  onClick={() => setSettings({ notificationsEnabled: !settings.notificationsEnabled })}
                  className={cn(
                    "w-12 h-6 rounded-full relative transition-all duration-500",
                    settings.notificationsEnabled ? "bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)]" : "bg-zinc-200 dark:bg-zinc-800"
                  )}
                >
                  <motion.div 
                    animate={{ x: settings.notificationsEnabled ? 26 : 2 }}
                    className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-sm"
                  />
                </button>
             </div>

             {settings.notificationsEnabled && (
               <motion.div 
                 initial={{ opacity: 0, scale: 0.95 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className="space-y-6 pt-6 border-t border-zinc-100 dark:border-zinc-800"
               >
                 <div className="space-y-4">
                   <div className="flex items-center gap-2 mb-2">
                     <Clock className="w-3 h-3 text-zinc-400" />
                     <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">Tempo</p>
                   </div>
                   <div className="flex gap-2 p-1.5 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
                      {(['once', 'twice', 'custom'] as const).map(freq => (
                        <button
                          key={freq}
                          onClick={() => setSettings({ notificationFrequency: freq })}
                          className={cn(
                            "flex-1 py-2 text-[9px] uppercase tracking-[0.2em] font-bold rounded-xl transition-all duration-500",
                            settings.notificationFrequency === freq 
                              ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm"
                              : "text-zinc-400 hover:text-zinc-600"
                          )}
                        >
                          {freq}
                        </button>
                      ))}
                   </div>
                 </div>
               </motion.div>
             )}
          </div>
        </section>

        {/* Info Section */}
        <section className="space-y-6">
          <SectionHeader title="Archive" />
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-3 border border-zinc-200 dark:border-zinc-800 space-y-1 shadow-sm">
             <InfoRow icon={<Info className="w-4 h-4" />} label="Volume Version" value="2.1.0-editorial" />
          </div>
        </section>

        <footer className="text-center space-y-2 opacity-20 pb-20">
          <p className="text-[8px] font-mono uppercase tracking-[0.4em]">Designed with Intention</p>
          <div className="flex justify-center gap-4">
             <div className="w-1 h-1 bg-current rounded-full" />
             <div className="w-1 h-1 bg-current rounded-full" />
             <div className="w-1 h-1 bg-current rounded-full" />
          </div>
        </footer>
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-[10px] font-mono uppercase tracking-[0.4em] text-zinc-400 ml-4">{title}</h3>
  );
}

function SettingRow({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between p-4 rounded-[1.5rem] transition-all duration-500 group",
        isActive ? "bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 shadow-xl" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      )}
    >
      <div className="flex items-center gap-4">
        <div className={cn("transition-transform duration-500", isActive ? "scale-110" : "group-hover:rotate-12")}>
          {icon}
        </div>
        <span className="text-sm font-serif font-medium">{label}</span>
      </div>
      {isActive && (
        <motion.div layoutId="setting-active" className="w-1 h-1 bg-orange-500 rounded-full" />
      )}
    </button>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode, label: string, value?: string }) {
  return (
    <div className="flex items-center justify-between p-3">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-black/5 dark:bg-white/5 rounded-xl">
          {icon}
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>
      {value ? (
        <span className="text-xs opacity-50 font-mono">{value}</span>
      ) : (
        <ChevronRight className="w-4 h-4 opacity-20" />
      )}
    </div>
  );
}
