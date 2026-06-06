// Firebase client SDK — browser-side, used for admin sign-in only.
// Safe to expose: NEXT_PUBLIC_* config is designed to ship in the client bundle.
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseClientConfigured = Boolean(config.apiKey && config.projectId);

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

export function getFirebaseAuth(): Auth {
  if (!isFirebaseClientConfigured) {
    throw new Error(
      "Firebase client is not configured. Add NEXT_PUBLIC_FIREBASE_* to .env.local."
    );
  }
  if (!app) app = getApps().length ? getApp() : initializeApp(config);
  if (!auth) auth = getAuth(app);
  return auth;
}
