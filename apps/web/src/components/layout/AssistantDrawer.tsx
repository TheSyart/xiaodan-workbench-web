import { useState } from 'react';
import { post } from '../../api.js';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  confirmationId?: string;
}

export function AssistantDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: '我是小单。可以帮你查询项目、任务、账目、日历和稿件元数据。稿件正文只在编辑器里由你采纳。'
    }
  ]);

  const send = async () => {
    const prompt = text.trim();
    if (!prompt) return;
    setText('');
    setMessages((old) => [...old, { role: 'user', text: prompt }]);

    let tool = 'projects.list';
    let args: Record<string, unknown> = { query: prompt };
    if (prompt.includes('任务')) tool = 'tasks.list';
    else if (prompt.includes('账')) tool = 'finance.list';
    else if (prompt.includes('稿')) tool = 'scripts.search';

    const createMatch = /新建(?:一个)?项目[：:]?\s*(.+)/.exec(prompt);
    if (createMatch?.[1]) {
      tool = 'projects.create';
      args = { name: createMatch[1].trim(), type: 'general', description: null, targetDate: null };
    }

    try {
      const data = await post<{
        requiresConfirmation?: boolean;
        confirmationId?: string;
        result?: unknown;
      }>('/assistant/execute', { tool, arguments: args });

      if (data.requiresConfirmation && data.confirmationId) {
        const confirmationId = data.confirmationId;
        setMessages((old) => [
          ...old,
          {
            role: 'assistant',
            text: `准备执行 ${tool}。请核对后确认；确认会在 24 小时后失效。`,
            confirmationId
          }
        ]);
      } else {
        setMessages((old) => [
          ...old,
          { role: 'assistant', text: `已查询：${JSON.stringify(data, null, 2).slice(0, 1200)}` }
        ]);
      }
    } catch (error) {
      setMessages((old) => [
        ...old,
        { role: 'assistant', text: error instanceof Error ? error.message : '执行失败' }
      ]);
    }
  };

  const confirm = async (id: string) => {
    try {
      const data = await post<{ result: unknown }>(`/assistant/confirm/${id}`, {});
      setMessages((old) => [
        ...old,
        { role: 'assistant', text: `已执行：${JSON.stringify(data.result, null, 2).slice(0, 1200)}` }
      ]);
    } catch (error) {
      setMessages((old) => [
        ...old,
        { role: 'assistant', text: error instanceof Error ? error.message : '确认失败' }
      ]);
    }
  };

  return (
    <div className={`assistant-sheet ${open ? 'open' : ''}`} aria-hidden={!open}>
      <header>
        <div>
          <span className="brand-mark small">单</span>
          <div>
            <strong>小单</strong>
            <small>全局工作助理</small>
          </div>
        </div>
        <button onClick={onClose}>关闭</button>
      </header>
      <div className="chat-feed">
        {messages.map((message, index) => (
          <div key={index} className={`chat-message ${message.role}`}>
            {message.text}
            {message.confirmationId && (
              <button
                className="confirm-action"
                onClick={() => void confirm(message.confirmationId!)}
              >
                确认执行
              </button>
            )}
          </div>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="例如：新建项目：九月口播计划"
        />
        <button className="primary">发送</button>
      </form>
    </div>
  );
}
