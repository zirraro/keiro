'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Pop-up de fin de tâche.
 *
 * Règle fondateur (2026-07-30) : quand une tâche demandée à un agent se
 * termine, le client doit le voir sur la page où il se trouve — « sinon il
 * oublie juste ». Une notification dans la cloche ne suffit pas : il faut que
 * ça vienne à lui, avec le détail rapide et une croix pour fermer.
 *
 * Volontairement sobre : uniquement les tâches que le client a LUI-MÊME
 * demandées dans un chat (les traitements de fond ne déclenchent rien), une
 * seule à la fois, et jamais deux fois la même (mémorisé localement). Sans
 * cette retenue, le pop-up devient du bruit qu'on apprend à ignorer.
 */

type Task = {
  id: string;
  agent: string;
  title: string;
  message: string;
  ok: boolean;
  at: string;
};

const SEEN_KEY = 'keiro_task_toasts_seen';

export default function TaskDoneToast() {
  const [task, setTask] = useState<Task | null>(null);
  const [seen, setSeen] = useState<string[]>([]);

  useEffect(() => {
    try { setSeen(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { /* pas de stockage */ }
  }, []);

  const check = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch('/api/notifications/tasks', { credentials: 'include' });
      if (!res.ok) return;
      const d = await res.json();
      const list: Task[] = d.tasks || [];
      let alreadySeen: string[] = [];
      try { alreadySeen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { /* ignore */ }
      const fresh = list.find(t => !alreadySeen.includes(t.id));
      if (fresh) setTask(prev => prev || fresh);
    } catch { /* une relève ratée n'a aucune conséquence */ }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, 25_000);
    return () => clearInterval(id);
  }, [check]);

  const dismiss = useCallback(() => {
    if (!task) return;
    const next = [...seen, task.id].slice(-50); // on ne garde que l'historique utile
    setSeen(next);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setTask(null);
  }, [task, seen]);

  if (!task) return null;

  const accent = task.ok ? 'emerald' : 'amber';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-5 sm:translate-x-0 z-[70] w-[calc(100%-2rem)] sm:w-[380px]"
    >
      <div className={`rounded-2xl border shadow-2xl backdrop-blur px-4 py-3 flex gap-3 items-start ${
        task.ok
          ? 'bg-emerald-50/95 border-emerald-300 dark:bg-emerald-950/90 dark:border-emerald-700'
          : 'bg-amber-50/95 border-amber-300 dark:bg-amber-950/90 dark:border-amber-700'
      }`}>
        <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0 ${
          task.ok ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
        }`}>
          {task.ok ? '✓' : '!'}
        </div>

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${accent === 'emerald' ? 'text-emerald-900 dark:text-emerald-100' : 'text-amber-900 dark:text-amber-100'}`}>
            {task.title}
          </p>
          <p className="text-xs leading-relaxed mt-0.5 text-neutral-700 dark:text-neutral-300 break-words">
            {task.message}
          </p>
        </div>

        <button
          onClick={dismiss}
          aria-label="Fermer"
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-black/5 dark:hover:text-white dark:hover:bg-white/10 transition"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
