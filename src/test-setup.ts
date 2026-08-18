// Runs before every file in the `dom` Vitest project.
//
// Testing Library does not unmount between tests on its own when globals are
// off, and a left-over tree makes the next test's queries match two elements
// and fail for a reason that has nothing to do with what it is checking.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
