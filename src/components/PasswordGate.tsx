import { useState, type FormEvent } from "react";
import { Lock, ShieldAlert } from "lucide-react";
import { tryLogin } from "@/lib/auth";

export function PasswordGate({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const envSet = Boolean(import.meta.env.VITE_DASHBOARD_PASSWORD);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!envSet) {
      setError("VITE_DASHBOARD_PASSWORD non défini.");
      return;
    }
    if (tryLogin(password)) onSuccess();
    else setError("Mot de passe incorrect.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-card p-8 border-neon shadow-neon"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="size-10 rounded-xl bg-gradient-neon flex items-center justify-center shadow-glow">
            <Lock className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Stats Umami</h1>
            <p className="text-xs text-muted-foreground">Tableau de bord privé</p>
          </div>
        </div>

        <label className="block text-sm font-medium mb-2" htmlFor="pwd">
          Mot de passe
        </label>
        <input
          id="pwd"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          className="w-full rounded-lg bg-input/60 px-3 py-2.5 text-sm outline-none ring-1 ring-border focus:ring-2 focus:ring-ring transition"
          placeholder="••••••••"
        />

        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
            <ShieldAlert className="size-4" /> {error}
          </div>
        )}

        <button
          type="submit"
          className="mt-6 w-full rounded-lg bg-gradient-neon py-2.5 text-sm font-semibold text-primary-foreground shadow-glow hover:opacity-95 transition"
        >
          Accéder au dashboard
        </button>

        {!envSet && (
          <p className="mt-4 text-xs text-muted-foreground">
            Définis <code className="text-foreground">VITE_DASHBOARD_PASSWORD</code> dans tes variables d'environnement.
          </p>
        )}
      </form>
    </div>
  );
}
