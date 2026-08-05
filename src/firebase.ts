import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

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

// Offline-first. The default cache is memory-only, which means no signal =
// no first snapshot, no quotes on screen, and writes that never settle. With
// a persistent cache Firestore mirrors every read into IndexedDB, serves it
// instantly on the next open, and queues writes until the phone is back.
// Dad works in buildings and basements — this is what stops him losing work.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
