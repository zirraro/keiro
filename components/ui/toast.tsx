import * as React from "react";

type ToastMsg = { id: number; text: string; tone?: "success"|"error"|"info" };

const Ctx = React.createContext<{
  push: (t: Omit<ToastMsg,"id">) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastMsg[]>([]);
  function push(t: Omit<ToastMsg,"id">) {
    const id = Date.now() + Math.random();
    setItems((arr) => [...arr, { id, ...t }]);
    setTimeout(() => setItems((arr) => arr.filter(x => x.id !== id)), 3000);
  }
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed right-4 bottom-4 z-50 space-y-2">
        {items.map(i => (
          <div key={i.id}
            className={`rounded-lg px-3 py-2 text-sm border ${
              i.tone==="success" ? "bg-green-500/15 border-green-500/40 text-green-300" :
              i.tone==="error" ? "bg-red-500/15 border-red-500/40 text-red-300" :
              "bg-neutral-800/70 border-neutral-700 text-neutral-100"
            }`}>
            {i.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
