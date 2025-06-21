// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAyjUhh_jfw5a_R1TluzfGweX1Jsymawnw",
  authDomain: "studyfellow-42d35.firebaseapp.com",
  projectId: "studyfellow-42d35",
  storageBucket: "studyfellow-42d35.firebasestorage.app",
  messagingSenderId: "122688802398",
  appId: "1:122688802398:web:de4c8ad4136bffbcffaecf",
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };