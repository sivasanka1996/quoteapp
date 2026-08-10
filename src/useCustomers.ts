import { useEffect, useState } from "react";
import {
  collection, onSnapshot, setDoc, updateDoc, getDocs, writeBatch,
  doc, orderBy, query, where, type Firestore,
} from "firebase/firestore";
import { db } from "./firebase";
import { log } from "./log/logger";
import { ackOrQueued, type WriteResult } from "./firestoreAck";
import { type Customer, type CustomerEdits } from "./types";

/**
 * Delete a customer and every quote that belongs to them (bug #6).
 *
 * Deleting only the customer left their quotes in the collection: invisible in
 * the UI, because you reach a quote through its customer, but still counted in
 * the home stat tiles. One batch, so the customer and their quotes go together
 * or not at all — a half-finished delete is that same orphan state.
 *
 * A batch caps at 500 operations, so this handles 499 quotes for a single
 * customer. Past that `commit` throws and nothing is deleted, which is the
 * right way to fail: loud, and never half-done. Dad is nowhere near it.
 *
 * Takes `db` rather than reaching for the app's instance so
 * `npx vite-node scripts/cascade-check.ts` can drive this exact function from
 * Node, where the app's IndexedDB-backed cache cannot start. Production passes
 * the app's `db`.
 *
 * No screen calls this yet — `deleteCustomer` below is returned by the hook and
 * consumed by nobody, so the only live caller is that script. See CLAUDE.md's
 * note under KNOWN GAPS before assuming Dad can delete a customer in the app.
 */
export async function deleteCustomerAndQuotes(db: Firestore, customerId: string) {
  try {
    const theirs = await getDocs(
      query(collection(db, "quotes"), where("customerId", "==", customerId))
    );
    const batch = writeBatch(db);
    theirs.forEach((q) => batch.delete(q.ref));
    batch.delete(doc(db, "customers", customerId));
    await batch.commit();
    log.info("firestore", "customer and quotes deleted", {
      customerId,
      quoteCount: theirs.size,
    });
  } catch (e) {
    log.error("firestore", "customer delete failed", e, { customerId });
    throw e;
  }
}

/**
 * Apply an edit to one customer.
 *
 * Standalone, like the delete above, so a screen can correct a customer without
 * opening a second `customers` snapshot listener just to reach the hook. Build
 * the patch with `customerPatch` — it decides what changed and refuses a blank
 * name; this function only writes what it is handed.
 *
 * No ack race here, unlike `saveQuote`, and callers must not `await` this to
 * drive a button: offline the promise never settles, because Firestore resolves
 * a write only on server ack. Nothing here claims Dad's data is safe, so there
 * is no promise worth racing — apply the change locally, let the persistent
 * cache replay the write, and treat a rejection as the rare real failure.
 */
export async function updateCustomerDoc(
  db: Firestore,
  customerId: string,
  patch: CustomerEdits
) {
  try {
    await updateDoc(doc(db, "customers", customerId), patch);
    log.info("firestore", "customer updated", {
      customerId,
      fields: Object.keys(patch),
    });
  } catch (e) {
    // Re-thrown: CustomerScreen reverts the sheet to the stored values and
    // shows a banner on rejection, so the screen never displays a value
    // Firestore refused.
    log.error("firestore", "customer update failed", e, {
      customerId,
      fields: Object.keys(patch),
    });
    throw e;
  }
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const q = query(collection(db, "customers"), orderBy("name"));
      const unsub = onSnapshot(
        q,
        (snap) => {
          try {
            setCustomers(
              snap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer))
            );
            log.debug("firestore", "customers snapshot", {
              count: snap.docs.length,
              fromCache: snap.metadata.fromCache,
            });
          } catch (e) {
            log.error("firestore", "customers snapshot could not be read", e);
          } finally {
            setLoading(false);
          }
        },
        // This listener had no error callback at all, so a failure left the
        // spinner up forever with nothing written anywhere.
        (e) => {
          log.error("firestore", "customers listener failed", e);
          setLoading(false);
        }
      );
      return unsub;
    } catch (e) {
      // Log, then let it through. Failing to even attach a listener means the
      // data layer is broken, and the ErrorBoundary's recovery card is the
      // honest answer — swallowing it would leave the spinner up forever.
      // This is also exactly what happened before the try/catch existed, so
      // the wrapping stays behaviour-preserving.
      log.error("firestore", "customers listener could not be attached", e);
      throw e;
    }
  }, []);

  /**
   * Add a customer, and never hang doing it (bug #10).
   *
   * This used `addDoc` with `serverTimestamp()`, which was wrong offline in two
   * separate ways. `addDoc` waits for the server to mint the id, so with no
   * signal the promise never settles and the button sits on "Saving…" forever —
   * PI-1 fixed exactly this for `saveQuote` and the same defect survived here.
   * And `serverTimestamp()` reads back as null from the local cache until the
   * server confirms, while `Customer.createdAt` is declared `number`.
   *
   * So: mint the id on the device with `doc()`, write with `setDoc`, stamp the
   * time locally, and race the ack. A customer added in a shop with no signal
   * now works exactly as a quote saved there already did.
   */
  async function addCustomer(
    name: string,
    phone: string,
    address: string
  ): Promise<WriteResult> {
    // doc() mints the id locally, so a new customer gets a stable id with no
    // signal — and the caller can navigate straight into it.
    const ref = doc(collection(db, "customers"));
    try {
      const write = setDoc(ref, {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        createdAt: Date.now(),
      });
      const queued = await ackOrQueued(write);
      log.info("firestore", "customer added", { id: ref.id, queued });
      return { id: ref.id, queued };
    } catch (e) {
      log.error("firestore", "customer add failed", e, { id: ref.id });
      throw e;
    }
  }

  async function updateCustomer(id: string, patch: CustomerEdits) {
    await updateCustomerDoc(db, id, patch);
  }

  async function deleteCustomer(id: string) {
    await deleteCustomerAndQuotes(db, id);
  }

  return { customers, loading, addCustomer, updateCustomer, deleteCustomer };
}
