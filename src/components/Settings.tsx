import React from 'react';
import { AppSettings } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Moon, Sun, Bell, Clock, Info, ChevronRight } from 'lucide-react';
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
      style={{ paddingTop: `${insets.top + 48}px` }}
      className="px-6 flex flex-col h-full bg-[#fdfaf5] dark:bg-[#080605]"
    >
      <div className="mb-10">
        <h1 className="text-3xl font-serif font-medium tracking-tight">Settings</h1>
        <p className="text-sm opacity-50 uppercase tracking-widest mt-1">Configure your experience</p>
      </div>

      <div className="flex-1 space-y-10 overflow-auto pb-10">
        {/* Appearance Section */}
        <section className="space-y-4">
          <SectionHeader title="Appearance" />
          <div className="bg-white/60 dark:bg-white/5 rounded-3xl p-4 border border-[#141414]/5 dark:border-white/5 space-y-4 shadow-sm">
            <SettingRow 
              icon={<Sun className="w-5 h-5" />}
              label="Light Mode"
              isActive={settings.theme === 'light'}
              onClick={() => setSettings({ theme: 'light' })}
            />
            <div className="h-px bg-black/5 dark:bg-white/5 mx-2" />
            <SettingRow 
              icon={<Moon className="w-5 h-5" />}
              label="Dark Mode"
              isActive={settings.theme === 'dark'}
              onClick={() => setSettings({ theme: 'dark' })}
            />
          </div>
        </section>

        {/* Notifications Section */}
        <section className="space-y-4">
          <SectionHeader title="Notifications" />
          <div className="bg-white/60 dark:bg-white/5 rounded-3xl p-4 border border-[#141414]/5 dark:border-white/5 space-y-6 shadow-sm">
             <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-xl text-orange-600 dark:text-orange-400">
                      <Bell className="w-5 h-5" />
                   </div>
                   <div>
                      <h4 className="text-sm font-medium">Daily Reminders</h4>
                      <p className="text-[10px] opacity-50">Gentle nudges to keep reading</p>
                   </div>
                </div>
                <button 
                  onClick={() => setSettings({ notificationsEnabled: !settings.notificationsEnabled })}
                  className={cn(
                    "w-12 h-6 rounded-full relative transition-colors duration-300",
                    settings.notificationsEnabled ? "bg-orange-500" : "bg-gray-300 dark:bg-gray-700"
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
                 initial={{ opacity: 0, height: 0 }}
                 animate={{ opacity: 1, height: 'auto' }}
                 className="space-y-4 pt-4 border-t border-black/5 dark:border-white/5 px-2"
               >
                 <div className="flex items-center gap-4">
                   <Clock className="w-4 h-4 opacity-40" />
                   <div className="flex-1">
                     <p className="text-xs font-medium mb-2">Frequency</p>
                     <div className="flex gap-2">
                        {(['once', 'twice', 'custom'] as const).map(freq => (
                          <button
                            key={freq}
                            onClick={() => setSettings({ notificationFrequency: freq })}
                            className={cn(
                              "flex-1 py-2 text-[10px] uppercase tracking-wider font-semibold rounded-xl border transition-all",
                              settings.notificationFrequency === freq 
                                ? "bg-[#141414] dark:bg-[#E0D8D0] text-[#E0D8D0] dark:text-[#141414] border-transparent"
                                : "border-black/10 dark:border-white/10 opacity-60"
                            )}
                          >
                            {freq}
                          </button>
                        ))}
                     </div>
                   </div>
                 </div>
               </motion.div>
             )}
          </div>
        </section>

        {/* Info Section */}
        <section className="space-y-4">
          <SectionHeader title="About" />
          <div className="bg-white/60 dark:bg-white/5 rounded-3xl p-4 border border-[#141414]/5 dark:border-white/5 space-y-4 shadow-sm">
             <InfoRow icon={<Info className="w-4 h-4" />} label="App Version" value="1.0.0" />
          </div>
        </section>

        <p className="text-center text-[10px] uppercase tracking-[0.2em] opacity-20 pb-10">
          Designed with intention • 2026
        </p>
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-[10px] uppercase tracking-[0.2em] opacity-40 ml-4 font-bold">{title}</h3>
  );
}

function SettingRow({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between p-3 rounded-2xl transition-all",
        isActive ? "bg-[#141414] dark:bg-[#E0D8D0] text-[#E0D8D0] dark:text-[#141414] shadow-md" : "hover:bg-black/5 dark:hover:bg-white/5"
      )}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      {isActive && (
        <div className="w-1.5 h-1.5 bg-current rounded-full" />
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
