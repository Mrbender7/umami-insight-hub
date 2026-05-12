import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PasswordGate } from "@/components/PasswordGate";
import { Dashboard } from "@/components/Dashboard";
import { isAuthed } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stats Umami — Dashboard analytique privé" },
      { name: "description", content: "Tableau de bord analytique privé connecté à Umami Cloud." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Index,
});

function Index() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAuthed(isAuthed());
    setReady(true);
  }, []);

  if (!ready) return <div className="min-h-screen" />;
  if (!authed) return <PasswordGate onSuccess={() => setAuthed(true)} />;
  return <Dashboard onLogout={() => setAuthed(false)} />;
}
