import React from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <small>{eyebrow}</small>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
}

export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

export function PanelState({
  loading,
  error,
  empty,
  children
}: {
  loading: boolean;
  error: unknown;
  empty?: boolean;
  children: React.ReactNode;
}) {
  if (loading) return <div className="state-box">正在整理数据…</div>;
  if (error) return <div className="state-box state-error">读取失败，请稍后重试。</div>;
  if (empty) return <div className="state-box">这里还没有内容。</div>;
  return <>{children}</>;
}
