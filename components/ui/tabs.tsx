"use client";

import * as React from "react";

type TabsProps = {
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  className?: string;
  children?: React.ReactNode;
};

type Ctx = { value: string; setValue: (v: string) => void };
const TabsCtx = React.createContext<Ctx | null>(null);

function cn(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

export function Tabs({ defaultValue, value, onValueChange, className, children }: TabsProps) {
  const controlled = typeof value !== "undefined";
  const [internal, setInternal] = React.useState<string>(defaultValue ?? "");
  const current = controlled ? (value as string) : internal;

  const setValue = (v: string) => {
    if (!controlled) setInternal(v);
    onValueChange?.(v);
  };

  // Si ni value ni defaultValue n'est fourni, prendre le premier TabsTrigger rencontré
  const initOnce = React.useRef(false);
  React.useEffect(() => {
    if (!initOnce.current && !controlled && !internal) {
      // nothing special; l'app appellera souvent <Tabs defaultValue="...">
    }
    initOnce.current = true;
  }, [controlled, internal]);

  return (
    <TabsCtx.Provider value={{ value: current, setValue }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsCtx.Provider>
  );
}

export function TabsList({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border bg-white p-1",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { value: string }) {
  const ctx = React.useContext(TabsCtx);
  if (!ctx) throw new Error("TabsTrigger must be used within <Tabs>");
  const active = ctx.value === value;

  return (
    <button
      role="tab"
      type="button"
      aria-selected={active}
      data-state={active ? "active" : "inactive"}
      onClick={() => ctx.setValue(value)}
      className={cn(
        "px-3 py-1 text-sm rounded-md border",
        active
          ? "bg-black text-white border-black"
          : "bg-white hover:bg-neutral-100",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { value: string }) {
  const ctx = React.useContext(TabsCtx);
  if (!ctx) throw new Error("TabsContent must be used within <Tabs>");
  const show = ctx.value === value;

  return (
    <div
      role="tabpanel"
      hidden={!show}
      className={cn(show ? "block" : "hidden", className)}
      {...props}
    >
      {show ? children : null}
    </div>
  );
}
