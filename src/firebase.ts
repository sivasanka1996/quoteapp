import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCAWvi1Ekiz_smS1INzxjf5Mjk9SToKoOA",
  authDomain: "quoteapp-3f48e.firebaseapp.com",
  projectId: "quoteapp-3f48e",
  storageBucket: "quoteapp-3f48e.firebasestorage.app",
  messagingSenderId: "166477443018",
  appId: "1:166477443018:web:10d7dc1534306a1c492933",
  measurementId: "G-V9BM3DFZ6V",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
