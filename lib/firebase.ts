import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCuQM8VI45SY-xDGl6f0FdEGDMkjKsxiAU",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "pinoy-ugc-agent.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "pinoy-ugc-agent",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "pinoy-ugc-agent.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "968186202671",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:968186202671:web:b5b246deb1460f2ed414da",
};

// Initialize Firebase for Client — Phone auth only
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export { app };
