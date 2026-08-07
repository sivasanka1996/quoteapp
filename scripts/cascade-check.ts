/**
 * Live check for bug #6 — deleting a customer must delete their quotes too.
 *
 * Drives the real `deleteCustomerAndQuotes` against the real Firestore project
 * with its own memory-cached client (the app's IndexedDB-backed cache cannot
 * start in Node). Everything it creates is named ZZ-cascade-check-* and is
 * deleted again in the finally block, whatever happens.
 *
 *   npx vite-node scripts/cascade-check.ts
 *
 * vite-node is fetched on demand rather than installed: vitest 4 no longer
 * depends on it, so adding it would pull a second copy of vite into the tree
 * for a script that runs about twice a year.
 *
 * THIS TOUCHES THE LIVE FIRESTORE PROJECT. It is deliberately not a *.test.ts
 * file, so `npm test` and CI never pick it up.
 *
 * Expect one `BloomFilter error: Invalid hash count: 0` on the console. That is
 * the Firestore SDK reconciling an existence filter, not this check failing —
 * it logs and falls back to a full re-query. Read the PASS/FAIL lines.
 */
import { initializeApp, deleteApp } from "firebase/app";
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs,
  query, where, deleteDoc,
} from "firebase/firestore";
import { deleteCustomerAndQuotes } from "../src/useCustomers";

const app = initializeApp({
  apiKey: "AIzaSyCAWvi1Ekiz_smS1INzxjf5Mjk9SToKoOA",
  authDomain: "quoteapp-3f48e.firebaseapp.com",
  projectId: "quoteapp-3f48e",
  storageBucket: "quoteapp-3f48e.firebasestorage.app",
  messagingSenderId: "166477443018",
  appId: "1:166477443018:web:10d7dc1534306a1c492933",
}, "cascade-check");

const db = getFirestore(app);

const TAG = "ZZ-cascade-check";
const created: Array<[string, string]> = [];

async function mkCustomer(name: string) {
  const ref = doc(collection(db, "customers"));
  await setDoc(ref, { name: `${TAG}-${name}`, phone: "", address: "", createdAt: Date.now() });
  created.push(["customers", ref.id]);
  return ref.id;
}

async function mkQuote(customerId: string, name: string) {
  const ref = doc(collection(db, "quotes"));
  await setDoc(ref, {
    customerId, customerName: TAG, name: `${TAG}-${name}`,
    lines: [], totalSale: 0, status: "draft",
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  created.push(["quotes", ref.id]);
  return ref.id;
}

const results: Array<[string, boolean, string]> = [];
function check(label: string, pass: boolean, detail = "") {
  results.push([label, pass, detail]);
}

async function exists(coll: string, id: string) {
  return (await getDoc(doc(db, coll, id))).exists();
}

async function main() {
  // Two customers, so this also proves the cascade does not over-reach.
  const victim = await mkCustomer("victim");
  const bystander = await mkCustomer("bystander");
  const vq1 = await mkQuote(victim, "victim-q1");
  const vq2 = await mkQuote(victim, "victim-q2");
  const bq1 = await mkQuote(bystander, "bystander-q1");

  await deleteCustomerAndQuotes(db, victim);

  check("customer document is gone", !(await exists("customers", victim)));
  check("their first quote is gone", !(await exists("quotes", vq1)));
  check("their second quote is gone", !(await exists("quotes", vq2)));
  check("the other customer survives", await exists("customers", bystander));
  check("the other customer's quote survives", await exists("quotes", bq1));

  // The orphan symptom itself: nothing left in the collection points at the
  // deleted customer. Orphans are what the home stat tiles kept counting.
  const orphans = await getDocs(query(collection(db, "quotes"), where("customerId", "==", victim)));
  check("no quote still points at the deleted customer", orphans.empty,
    `${orphans.size} orphan(s) left behind`);
}

main()
  .catch((e) => check("ran without throwing", false, String(e)))
  .finally(async () => {
    for (const [coll, id] of created) {
      try { await deleteDoc(doc(db, coll, id)); } catch { /* already gone */ }
    }
    let failed = 0;
    for (const [label, pass, detail] of results) {
      if (!pass) failed++;
      console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
    }
    console.log(failed === 0
      ? `\nall ${results.length} checks passed`
      : `\n${failed} of ${results.length} FAILED`);
    await deleteApp(app);
    process.exit(failed === 0 ? 0 : 1);
  });
