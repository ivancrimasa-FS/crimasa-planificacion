import { initializeApp } from "firebase/app";
import type { FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

/**
 * La configuración se lee de variables de entorno (archivo .env en local,
 * Settings → Environment Variables en Vercel). Nunca se escriben las claves aquí.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseReady = Boolean(config.apiKey && config.projectId);

let app: FirebaseApp | null = null;
let firestore: Firestore | null = null;

if (firebaseReady) {
  app = initializeApp(config);
  firestore = getFirestore(app);
}

export const db = firestore;

/** Colecciones propias de esta app, separadas del resto de proyectos del mismo Firebase. */
export const COL_CATALOGO = "plan_catalogo";
export const DOC_CATALOGO = "global";
export const COL_DIAS = "plan_dias";

/**
 * Login anónimo. Si el proveedor "Anónimo" no está activado en Firebase, la app
 * sigue funcionando siempre que las reglas de Firestore permitan el acceso.
 */
export async function ensureAuth(): Promise<void> {
  if (!app) return;
  try {
    const auth = getAuth(app);
    if (!auth.currentUser) await signInAnonymously(auth);
  } catch (err) {
    console.warn("Login anónimo no disponible, se continúa sin autenticar:", err);
  }
}
