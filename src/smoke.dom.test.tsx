import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

describe("jsdom project", () => {
  it("renders a component and finds it in the document", () => {
    render(<button type="button">Read from Image</button>);
    expect(screen.getByRole("button", { name: "Read from Image" })).toBeInTheDocument();
  });
});
