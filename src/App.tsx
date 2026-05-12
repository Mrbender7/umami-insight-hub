import { useEffect, useState } from "react";
import { PasswordGate } from "@/components/PasswordGate";
import { Dashboard } from "@/components/Dashboard";
import { isAuthed } from "@/lib/auth";

export default function App() {
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
