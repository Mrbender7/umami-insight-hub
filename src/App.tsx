import { useEffect, useState } from "react";
import { PasswordGate } from "@/components/PasswordGate";
import { Dashboard } from "@/components/Dashboard";
import { isAuthed } from "@/lib/auth";
import { getEnvStatus } from "@/lib/umami";

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAuthed(isAuthed());
    setReady(true);
  }, []);

  const env = getEnvStatus();
  const missing: string[] = [];
  if (!env.websiteId) missing.push("VITE_UMAMI_WEBSITE_ID");
  if (!env.apiToken) missing.push("VITE_UMAMI_API_TOKEN");
  if (!import.meta.env.VITE_DASHBOARD_PASSWORD) missing.push("VITE_DASHBOARD_PASSWORD");
  const startupWarnings: string[] = [];
  if (env.apiTokenEmpty) startupWarnings.push("Attention: VITE_UMAMI_API_TOKEN est vide");

  if (!ready) return <div className="min-h-screen" />;

  return (
    <>
      {startupWarnings.length > 0 && (
        <div className="bg-destructive text-destructive-foreground px-4 py-2 text-sm text-center">
          {startupWarnings.join(" · ")}
        </div>
      )}
      {missing.length > 0 && (
        <div className="bg-destructive text-destructive-foreground px-4 py-2 text-sm text-center">
          Variables d'environnement manquantes : {missing.join(", ")}. Vérifiez vos GitHub Secrets et le workflow de build.
        </div>
      )}
      {!authed ? (
        <PasswordGate onSuccess={() => setAuthed(true)} />
      ) : (
        <Dashboard onLogout={() => setAuthed(false)} />
      )}
    </>
  );
}
