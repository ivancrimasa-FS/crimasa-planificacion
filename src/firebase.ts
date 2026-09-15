import { initializeApp } from "firebase/app";
import type { FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import type { Auth } from "firebase/auth";

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
let authInstance: Auth | null = null;

if (firebaseReady) {
  app = initializeApp(config);
  firestore = getFirestore(app);
  authInstance = getAuth(app);
}

export const db = firestore;
export const auth = authInstance;

/** Colecciones propias de esta app, separadas del resto de proyectos del mismo Firebase. */
export const COL_CATALOGO = "plan_catalogo";
export const DOC_CATALOGO = "global";
export const COL_DIAS = "plan_dias";
