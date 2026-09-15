import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { auth, firebaseReady } from "./firebase";

interface AuthContextValue {
  user: User | null;
  email: string;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthGate>");
  return ctx;
}

/** Traduce los códigos de error de Firebase a algo legible. */
function mensajeDeError(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "El correo no tiene un formato válido.";
    case "auth/user-disabled":
      return "Esta cuenta está deshabilitada. Habla con el administrador.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Usuario o contraseña incorrectos.";
    case "auth/too-many-requests":
      return "Demasiados intentos fallidos. Espera unos minutos e inténtalo otra vez.";
    case "auth/network-request-failed":
      return "Sin conexión con el servidor. Comprueba la red.";
    case "auth/operation-not-allowed":
      return "El acceso por correo y contraseña no está activado en Firebase.";
    default:
      return "No se ha podido iniciar sesión (" + code + ").";
  }
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseReady || !auth) {
      setLoading(false);
      return;
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="app-shell">
        <div className="wrap" style={{ paddingTop: "4rem" }}>
          <div className="card-surface empty-state">Comprobando la sesión…</div>
        </div>
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  const value: AuthContextValue = {
    user,
    email: user.email || "",
    logout: async () => {
      if (auth) await signOut(auth);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const entrar = async () => {
    if (!auth) return;
    if (!email.trim() || !password) {
      setError("Escribe el correo y la contraseña.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      setError(mensajeDeError(err?.code || "desconocido"));
    } finally {
      setBusy(false);
    }
  };

  const recuperar = async () => {
    if (!auth) return;
    if (!email.trim()) {
      setError("Escribe primero tu correo para enviarte el enlace.");
      return;
    }
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo("Te hemos enviado un correo para cambiar la contraseña. Mira también la carpeta de spam.");
    } catch (err: any) {
      setError(mensajeDeError(err?.code || "desconocido"));
    }
  };

  return (
    <div className="app-shell login-shell">
      <div className="login-card card-surface">
        <div className="login-brand">
          <svg width={52} height={52} viewBox="0 0 96 96" role="img" aria-label="CRIMASA">
            <rect x="1" y="1" width="94" height="94" rx="14" fill="var(--card)" stroke="var(--border)" />
            <path d="M48 20 66 52H30z" fill="var(--navy)" />
            <path d="M48 32 58 52H38z" fill="var(--card)" />
            <rect x="14" y="60" width="68" height="20" rx="6" fill="var(--gold)" />
            <text
              x="48"
              y="74"
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill="var(--primary-foreground)"
              fontFamily="Inter Tight, sans-serif"
            >
              30 AÑOS
            </text>
          </svg>
          <div>
            <h1 className="section-title" style={{ fontSize: "1.05rem" }}>
              CRIMASA · Planificación de personal
            </h1>
            <div className="gold-rule" />
          </div>
        </div>

        <label className="field">
          <span>Correo</span>
          <input
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            onKeyDown={(ev) => ev.key === "Enter" && entrar()}
          />
        </label>

        <label className="field">
          <span>Contraseña</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            onKeyDown={(ev) => ev.key === "Enter" && entrar()}
          />
        </label>

        {error && <p className="login-error">{error}</p>}
        {info && <p className="xs muted">{info}</p>}

        <button className="btn btn-primary" style={{ height: "2.4rem" }} onClick={entrar} disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
        </button>

        <button className="link-button" onClick={recuperar}>
          He olvidado la contraseña
        </button>
      </div>
    </div>
  );
}
