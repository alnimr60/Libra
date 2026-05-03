import React from 'react';
import { AppSettings } from '../types';
import { motion } from 'motion/react';
import { Moon, Sun, Bell, Clock, Info, ChevronRight, Monitor, Layout, RotateCw, Globe } from 'lucide-react';
import { cn } from '../lib/utils';
import { useSafeArea } from './SafeAreaProvider';
import { translations } from '../translations';

interface SettingsProps {
  settings: AppSettings;
  setSettings: (settings: Partial<AppSettings>) => void;
}

export default function Settings({ settings, setSettings }: SettingsProps) {
  const insets = useSafeArea();
  const t = translations[settings.language];
  const isRTL = settings.language === 'ar';

  return (
    <div 
      style={{ paddingTop: `${insets.top + 32}px` }}
      className="px-6 flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 transition-colors duration-500"
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className="mb-10">
        <h1 className={cn("text-4xl font-serif tracking-tight", isRTL ? "font-bold" : "font-medium")}>{t.settings}</h1>
        <p className={cn("text-[10px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.3em] mt-2", isRTL && "font-bold")}>
          {isRTL ? "تخصيص عالمك" : "CONFIGURE YOUR UNIVERSE"}
        </p>
      </div>

      <div className="flex-1 space-y-10 overflow-y-auto no-scrollbar pb-10">
        {/* Language Section */}
        <section className="space-y-6">
          <SectionHeader title={t.language} isRTL={isRTL} />
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-3 border border-zinc-200 dark:border-zinc-800 space-y-1 shadow-sm">
            <SettingRow 
              icon={<Globe className="w-4 h-4" />}
              label="English"
              isActive={settings.language === 'en'}
              onClick={() => setSettings({ language: 'en' })}
              isRTL={isRTL}
            />
            <SettingRow 
              icon={<Globe className="w-4 h-4" />}
              label="العربية"
              isActive={settings.language === 'ar'}
              onClick={() => setSettings({ language: 'ar' })}
              isRTL={isRTL}
            />
          </div>
        </section>

        {/* Appearance Section */}
        <section className="space-y-6">
          <SectionHeader title={t.appearance} isRTL={isRTL} />
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-3 border border-zinc-200 dark:border-zinc-800 space-y-1 shadow-sm">
            <SettingRow 
              icon={<Sun className="w-4 h-4" />}
              label={settings.language === 'ar' ? "نهاري" : "Solar"}
              isActive={settings.theme === 'light'}
              onClick={() => setSettings({ theme: 'light' })}
              isRTL={isRTL}
            />
            <SettingRow 
              icon={<Moon className="w-4 h-4" />}
              label={settings.language === 'ar' ? "ليلي" : "Lunar"}
              isActive={settings.theme === 'dark'}
              onClick={() => setSettings({ theme: 'dark' })}
              isRTL={isRTL}
            />
            <SettingRow 
              icon={<Monitor className="w-4 h-4" />}
              label={t.system}
              isActive={settings.theme === 'system'}
              onClick={() => setSettings({ theme: 'system' })}
              isRTL={isRTL}
            />
          </div>
        </section>

        {/* Dashboard Style Section */}
        <section className="space-y-6">
          <SectionHeader title={t.dashboardStyle} isRTL={isRTL} />
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-3 border border-zinc-200 dark:border-zinc-800 space-y-1 shadow-sm">
            <SettingRow 
              icon={<Layout className="w-4 h-4" />}
              label={t.linear}
              isActive={settings.dashboardStyle === 'linear'}
              onClick={() => setSettings({ dashboardStyle: 'linear' })}
              isRTL={isRTL}
            />
            <SettingRow 
              icon={<RotateCw className="w-4 h-4" />}
              label={t.circular}
              isActive={settings.dashboardStyle === 'circular'}
              onClick={() => setSettings({ dashboardStyle: 'circular' })}
              isRTL={isRTL}
            />
          </div>
        </section>

        {/* Notifications Section */}
        <section className="space-y-6">
          <SectionHeader title={t.notifications} isRTL={isRTL} />
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border border-zinc-200 dark:border-zinc-800 space-y-8 shadow-sm">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="p-3 bg-orange-500/10 rounded-2xl text-orange-600">
                      <Bell className="w-5 h-5" />
                   </div>
                   <div>
                      <h4 className={cn("text-sm font-serif", isRTL ? "font-bold" : "font-medium")}>{isRTL ? "أمنيات يومية" : "Daily Nudges"}</h4>
                      <p className={cn("text-[10px] font-mono text-zinc-400 uppercase tracking-widest leading-loose", isRTL && "font-bold tracking-normal")}>
                        {isRTL ? "تذكير بالاستمرارية" : "Continuity reminders"}
                      </p>
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
                    animate={{ x: settings.notificationsEnabled ? (isRTL ? -26 : 26) : 2 }}
                    className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-sm"
                  />
                </button>
             </div>
          </div>
        </section>

        {/* Info Section */}
        <section className="space-y-6">
          <SectionHeader title={isRTL ? "معلومات" : "Archive"} isRTL={isRTL} />
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-3 border border-zinc-200 dark:border-zinc-800 space-y-1 shadow-sm">
             <InfoRow icon={<Info className="w-4 h-4" />} label={isRTL ? "الإصدار" : "Volume Version"} value="2.1.0-editorial" isRTL={isRTL} />
          </div>
        </section>

        <footer className="text-center space-y-2 opacity-20 pb-10">
          <p className="text-[8px] font-mono uppercase tracking-[0.4em]">
            {isRTL ? "صمم بعناية" : "Designed with Intention"}
          </p>
        </footer>
      </div>
    </div>
  );
}

function SectionHeader({ title, isRTL }: { title: string, isRTL?: boolean }) {
  return (
    <h3 className={cn("text-[10px] font-mono uppercase tracking-[0.4em] text-zinc-400", isRTL ? "mr-4" : "ml-4", isRTL && "font-bold tracking-normal")}>{title}</h3>
  );
}

function SettingRow({ icon, label, isActive, onClick, isRTL }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, isRTL?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between p-4 rounded-[1.5rem] transition-all duration-500 group",
        isActive ? "bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 shadow-xl" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      )}
    >
      <div className={cn("flex items-center gap-4", isRTL ? "flex-row-reverse" : "flex-row")}>
        <div className={cn("transition-transform duration-500", isActive ? "scale-110" : "group-hover:rotate-12")}>
          {icon}
        </div>
        <span className={cn("text-sm font-serif", isRTL ? "font-bold" : "font-medium")}>{label}</span>
      </div>
      {isActive && (
        <motion.div layoutId="setting-active" className="w-1 h-1 bg-orange-500 rounded-full" />
      )}
    </button>
  );
}

function InfoRow({ icon, label, value, isRTL }: { icon: React.ReactNode, label: string, value?: string, isRTL?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between p-3", isRTL ? "flex-row-reverse" : "flex-row")}>
      <div className={cn("flex items-center gap-3", isRTL ? "flex-row-reverse" : "flex-row")}>
        <div className="p-2 bg-black/5 dark:bg-white/5 rounded-xl">
          {icon}
        </div>
        <span className={cn("text-sm", isRTL ? "font-bold" : "font-medium")}>{label}</span>
      </div>
      {value ? (
        <span className="text-xs opacity-50 font-mono tracking-normal">{value}</span>
      ) : (
        <ChevronRight className={cn("w-4 h-4 opacity-20", isRTL && "rotate-180")} />
      )}
    </div>
  );
}
