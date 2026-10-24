// M1 (a): update banner from version.json. Fails silent everywhere (offline, 404, bad JSON, file://, single-file HTML).
import { useEffect, useState } from "react";

declare const __NF_BUILD__: string;
declare const __NF_VERSION__: string;
export type VersionInfo = { version?: unknown; build?: unknown };

function semver(v: unknown): number[] | null {
  if (typeof v !== "string") return null;
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

/** true when remote is a different build AND its semver is >= local (never "update" to a rollback) */
export function isNewer(remote: VersionInfo | null | undefined, local: { version: string; build: string }): boolean {
  if (!remote || typeof remote.build !== "string" || !remote.build) return false;
  if (remote.build === local.build) return false;
  const r = semver(remote.version), l = semver(local.version);
  if (!r || !l) return false;
  for (let i = 0; i < 3; i++) if (r[i] !== l[i]) return r[i] > l[i];
  return true;
}

function dismissed(build: string): boolean {
  try { return localStorage.getItem("nf_dismissed_build") === build; } catch { return true; }
}
export function dismissBuild(build: string) {
  try { localStorage.setItem("nf_dismissed_build", build); } catch { /* private mode: session only */ }
}

/** returns the remote build id when a banner should be offered, else null */
export function useUpdateBanner(): string | null {
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    const local = { version: typeof __NF_VERSION__ === "string" ? __NF_VERSION__ : "", build: typeof __NF_BUILD__ === "string" ? __NF_BUILD__ : "" };
    if (!local.build || location.protocol === "file:") return;
    let last = 0;
    let off = false;
    async function check() {
      const now = Date.now();
      if (now - last < 10 * 60 * 1000 && last) return;
      last = now;
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 4000);
      try {
        const res = await fetch("./version.json?t=" + now, { cache: "no-store", signal: ac.signal });
        if (!res.ok) return;
        const remote = (await res.json()) as VersionInfo;
        if (!off && isNewer(remote, local) && !dismissed(remote.build as string)) setReady(remote.build as string);
      } catch (e) {
        console.debug("[nf] update check skipped", e);
      } finally {
        clearTimeout(t);
      }
    }
    const boot = setTimeout(check, 3000);
    const vis = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", vis);
    return () => { off = true; clearTimeout(boot); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return ready;
}
