"use client";
import { useEffect } from "react";

export default function ChunkGuard() {
  useEffect(() => {
    let reloaded = false;
    const reloadOnce = () => {
      if (reloaded) return;
      reloaded = true;
      const u = new URL(window.location.href);
      u.searchParams.set("_r", Date.now().toString()); // bust cache
      window.location.replace(u.toString());
    };

    function onErr(e: any) {
      const msg = String(e?.message || e?.error?.message || "");
      const name = String(e?.error?.name || "");
      if (msg.includes("Loading chunk") || name === "ChunkLoadError") reloadOnce();
    }
    function onRej(e: any) {
      const msg = String(e?.reason?.message || "");
      const name = String(e?.reason?.name || "");
      if (msg.includes("Loading chunk") || name === "ChunkLoadError") reloadOnce();
    }

    window.addEventListener("error", onErr, true);
    window.addEventListener("unhandledrejection", onRej);

    return () => {
      window.removeEventListener("error", onErr, true);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);

  return null;
}
