import React from 'react';
import { AppSettings } from '../types';
import { motion } from 'motion/react';
import { Moon, Sun, Bell, Clock, Info, ShieldCheck, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface SettingsProps {
  settings: AppSettings;
  setSettings: (settings: Partial<AppSettings>) => void;
}

export default function Settings({ settings, setSettings }: SettingsProps) {
  return (
    <div className="px-6 pt-12 flex flex-col h-full bg-[#fdfaf5] dark:bg-[#080605]">
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
          <SectionHeader title="Reading Reminders" />
          <div className="bg-white/60 dark:bg-white/10 rounded-[32px] p-8 border border-[#141414]/5 dark:border-white/5 shadow-2xl relative overflow-hidden group">
             {/* Decorative background element */}
             <div className="absolute -top-20 -right-20 w-40 h-40 bg-orange-500/5 rounded-full blur-3xl group-hover:bg-orange-500/10 transition-colors duration-700" />
             
             <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-5">
                   <div className={cn(
                     "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500",
                     settings.notificationsEnabled 
                        ? "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/20" 
                        : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                   )}>
                      <Bell className="w-7 h-7" />
                   </div>
                   <div>
                      <h4 className="text-lg font-bold tracking-tight">Active Reminders</h4>
                      <p className="text-xs opacity-50 font-medium">Build a reading habit with smart nudges</p>
                   </div>
                </div>
                <button 
                  onClick={() => setSettings({ notificationsEnabled: !settings.notificationsEnabled })}
                  className={cn(
                    "w-16 h-8 rounded-full relative transition-all duration-500",
                    settings.notificationsEnabled ? "bg-orange-500" : "bg-gray-200 dark:bg-gray-800"
                  )}
                >
                  <motion.div 
                    animate={{ x: settings.notificationsEnabled ? 34 : 4 }}
                    className="absolute top-1 left-0 w-6 h-6 bg-white rounded-full shadow-lg"
                  />
                </button>
             </div>

             <AnimatePresence>
               {settings.notificationsEnabled && (
                 <motion.div 
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: 10 }}
                   className="space-y-10"
                 >
                   <div>
                     <label className="text-[10px] uppercase tracking-[0.2em] font-black opacity-30 mb-5 block">Cadence</label>
                     <div className="grid grid-cols-3 gap-3 p-1.5 bg-black/5 dark:bg-white/5 rounded-2xl">
                        {(['once', 'twice', 'custom'] as const).map(freq => (
                          <button
                            key={freq}
                            onClick={() => setSettings({ notificationFrequency: freq })}
                            className={cn(
                              "py-3.5 text-[11px] uppercase tracking-wider font-extrabold rounded-xl transition-all duration-300",
                              settings.notificationFrequency === freq 
                                ? "bg-white dark:bg-zinc-900 text-orange-600 dark:text-orange-400 shadow-md scale-[1.02]"
                                : "opacity-40 hover:opacity-60"
                            )}
                          >
                            {freq}
                          </button>
                        ))}
                     </div>
                   </div>

                   <div className="space-y-5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] uppercase tracking-[0.2em] font-black opacity-30">Preferred Windows</label>
                        {settings.notificationFrequency === 'custom' && (
                          <button 
                            onClick={() => setSettings({ customNotificationTimes: [...settings.customNotificationTimes, "09:00"] })}
                            className="text-[10px] uppercase font-black text-orange-500 hover:opacity-80 transition-opacity"
                          >
                            + Add Window
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         {settings.customNotificationTimes.map((time, idx) => (
                           <motion.div 
                             layout
                             initial={{ opacity: 0, scale: 0.9 }}
                             animate={{ opacity: 1, scale: 1 }}
                             key={idx} 
                             className="relative group/time"
                           >
                             <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                               <Clock className="w-5 h-5 opacity-20 group-focus-within/time:opacity-60 group-focus-within/time:text-orange-500 transition-all" />
                             </div>
                             <input 
                               type="time" 
                               value={time}
                               onChange={(e) => {
                                 const newTimes = [...settings.customNotificationTimes];
                                 newTimes[idx] = e.target.value;
                                 setSettings({ customNotificationTimes: newTimes });
                               }}
                               className="w-full pl-12 pr-12 py-5 bg-white dark:bg-white/5 rounded-2x border border-black/5 dark:border-white/5 text-base font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                             />
                             {settings.customNotificationTimes.length > 1 && (
                               <button 
                                 onClick={() => {
                                   const newTimes = settings.customNotificationTimes.filter((_, i) => i !== idx);
                                   setSettings({ customNotificationTimes: newTimes });
                                 }}
                                 className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full opacity-0 group-hover/time:opacity-100 transition-opacity"
                               >
                                 <Trash2 className="w-4 h-4 text-red-500/50" />
                               </button>
                             )}
                           </motion.div>
                         ))}
                      </div>
                   </div>

                   <div className="p-6 bg-orange-500/5 rounded-[24px] border border-orange-500/10 italic">
                      <p className="text-xs text-orange-600/70 dark:text-orange-400/60 leading-relaxed font-medium">
                        "The man who does not read has no advantage over the man who cannot read." — Mark Twain
                      </p>
                   </div>
                 </motion.div>
               )}
             </AnimatePresence>
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
