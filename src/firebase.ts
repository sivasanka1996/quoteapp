import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  connectFirestoreEmulator,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { appConfig } from "../config/app.config";
import { log } from "./log/logger";

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

/**
 * Talk to a throwaway Firestore on this machine instead of Dad's real one.
 *
 * Driven by Vite's own `--mode` (`npm run dev:local` → `vite --mode emulator`),
 * which needs no extra dependency and behaves the same on every platform — a
 * `VITE_FOO=1 vite` prefix does not work in PowerShell, where Siva runs things.
 *
 * Off in every build that ships: `deploy.yml` runs plain `npm run build`, whose
 * mode is "production", so a deploy cannot accidentally point at localhost.
 *
 * This exists because the default was dangerous: plain `npm run dev` reads and
 * writes the LIVE database. Every browser check in this repo's history created
 * throwaway `ZZ-` customers in production and deleted them afterwards, and one
 * forgotten cleanup is one row of Dad's real data gone.
 */
const USE_EMULATOR = import.meta.env.MODE === "emulator";

// Offline-first. The default cache is memory-only, which means no signal =
// no first snapshot, no quotes on screen, and writes that never settle. With
// a persistent cache Firestore mirrors every read into IndexedDB, serves it
// instantly on the next open, and queues writes until the phone is back.
// Dad works in buildings and basements — this is what stops him losing work.
//
// Against the emulator the cache is memory-only on purpose: a persisted cache
// would survive `firebase emulators:start` being restarted, so yesterday's
// test data would reappear against an empty database and look like a bug.
export const db = initializeFirestore(app, {
  localCache: USE_EMULATOR
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (USE_EMULATOR) {
  // Must happen before any read or write. `initializeFirestore` above does not
  // touch the network, so this is still the first thing that does.
  const { firestorePort } = appConfig.firestore.emulator;
  connectFirestoreEmulator(db, "127.0.0.1", firestorePort);
  log.warn("firestore", "USING LOCAL EMULATOR — not the real database", {
    port: firestorePort,
  });
  // Loud on purpose. Reading "no quotes" and concluding the app is broken,
  // when really you are pointed at an empty local database, wastes an hour.
  console.warn(
    `%c⚠ Firestore emulator on :${firestorePort} — this is NOT Dad's data`,
    "background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px"
  );
}
