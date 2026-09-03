import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { apiRoot } from '../../api.js';
import {
  HomeIcon,
  WalletIcon,
  ScriptIcon,
  CalendarIcon,
  ProjectIcon,
  SettingsIcon,
  SparklesIcon,
  SunIcon,
  MoonIcon
} from '../common/Icons.js';
import { AssistantDrawer } from './AssistantDrawer.js';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

const navItems: NavItem[] = [
  { to: '/', label: '今日', icon: HomeIcon },
  { to: '/finance', label: '记账', icon: WalletIcon },
  { to: '/scripts', label: '稿件', icon: ScriptIcon },
  { to: '/calendar', label: '日历', icon: CalendarIcon },
  { to: '/projects', label: '项目', icon: ProjectIcon }
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('xiaodan-theme') === 'dark');
  const [reminder, setReminder] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('xiaodan-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    if (!('EventSource' in window)) return;
    const source = new EventSource(`${apiRoot}/reminders/events`);
    source.onmessage = (event) => {
      const data = JSON.parse(event.data) as { title: string };
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(data.title);
      } else {
        setReminder(data.title);
      }
    };
    return () => source.close();
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">单</span>
          <div>
            <strong>小单工作台</strong>
            <small>个人创作与事务</small>
          </div>
        </div>

        <nav aria-label="全局导航">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              <span>
                <Icon size={16} />
              </span>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button
            className={`nav-item assistant-trigger ${assistantOpen ? 'active' : ''}`}
            onClick={() => setAssistantOpen(true)}
          >
            <span>
              <SparklesIcon size={16} />
            </span>
            小单
          </button>
          <NavLink
            to="/settings"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            <span>
              <SettingsIcon size={16} />
            </span>
            设置
          </NavLink>
          <button className="theme-toggle" onClick={() => setDark(!dark)}>
            <span>{dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}</span>
            <span>{dark ? '切换浅色' : '切换深色'}</span>
          </button>
        </div>
      </aside>

      <main className="main-stage">{children}</main>

      <AssistantDrawer open={assistantOpen} onClose={() => setAssistantOpen(false)} />

      {reminder && (
        <button className="reminder-toast" onClick={() => setReminder(null)}>
          <strong>时间到了</strong>
          <span>{reminder}</span>
        </button>
      )}
    </div>
  );
}
