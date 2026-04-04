import { describe, it, expect } from "vitest";
import { buildHeadingBreadcrumb, Heading } from "../heading-context";

describe("buildHeadingBreadcrumb", () => {
    it("returns empty string when no headings", () => {
        expect(buildHeadingBreadcrumb([], 100, 200)).toBe("");
    });

    it("returns empty string when selection is before all headings", () => {
        const headings: Heading[] = [
            { level: 1, text: "Title", offset: 50 },
        ];
        expect(buildHeadingBreadcrumb(headings, 10, 40)).toBe("");
    });

    it("returns single heading when only one precedes selection", () => {
        const headings: Heading[] = [
            { level: 1, text: "Title", offset: 0 },
        ];
        expect(buildHeadingBreadcrumb(headings, 20, 40)).toBe("# Title");
    });

    it("returns nested breadcrumb for multiple heading levels", () => {
        const headings: Heading[] = [
            { level: 1, text: "Title", offset: 0 },
            { level: 2, text: "Chapter 2", offset: 50 },
            { level: 3, text: "Section 2.2", offset: 100 },
        ];
        expect(buildHeadingBreadcrumb(headings, 150, 200)).toBe(
            "# Title > ## Chapter 2 > ### Section 2.2"
        );
    });

    it("only includes ancestor headings, not sibling sections", () => {
        const headings: Heading[] = [
            { level: 1, text: "Title", offset: 0 },
            { level: 2, text: "Chapter 1", offset: 20 },
            { level: 2, text: "Chapter 2", offset: 80 },
            { level: 3, text: "Section 2.1", offset: 100 },
        ];
        // Selection is under Section 2.1 — Chapter 1 should not appear
        expect(buildHeadingBreadcrumb(headings, 150, 200)).toBe(
            "# Title > ## Chapter 2 > ### Section 2.1"
        );
    });

    it("excludes heading at exact selection start offset", () => {
        const headings: Heading[] = [
            { level: 1, text: "Title", offset: 0 },
            { level: 2, text: "This Heading", offset: 50 },
        ];
        // Selection starts exactly at heading offset — heading is the selection itself
        expect(buildHeadingBreadcrumb(headings, 50, 80)).toBe("# Title");
    });

    it("shows range when selection spans multiple leaf sections", () => {
        const headings: Heading[] = [
            { level: 1, text: "Title", offset: 0 },
            { level: 2, text: "Chapter 2", offset: 50 },
            { level: 3, text: "Section 2.2", offset: 100 },
            { level: 3, text: "Section 2.3", offset: 200 },
            { level: 3, text: "Section 2.4", offset: 300 },
        ];
        // Selection spans from Section 2.2 into Section 2.4
        expect(buildHeadingBreadcrumb(headings, 150, 350)).toBe(
            "# Title > ## Chapter 2 > ### Section 2.2 … ### Section 2.4"
        );
    });

    it("shows range when selection spans different parent headings", () => {
        const headings: Heading[] = [
            { level: 1, text: "Title", offset: 0 },
            { level: 2, text: "Chapter 1", offset: 50 },
            { level: 3, text: "Section 1.3", offset: 100 },
            { level: 2, text: "Chapter 2", offset: 200 },
            { level: 3, text: "Section 2.1", offset: 250 },
        ];
        // Selection spans from Section 1.3 to Section 2.1
        expect(buildHeadingBreadcrumb(headings, 150, 300)).toBe(
            "# Title > ## Chapter 1 … ## Chapter 2"
        );
    });

    it("handles deeply nested headings correctly", () => {
        const headings: Heading[] = [
            { level: 1, text: "Book", offset: 0 },
            { level: 2, text: "Part I", offset: 20 },
            { level: 3, text: "Ch 1", offset: 40 },
            { level: 4, text: "Sec 1.1", offset: 60 },
        ];
        expect(buildHeadingBreadcrumb(headings, 80, 100)).toBe(
            "# Book > ## Part I > ### Ch 1 > #### Sec 1.1"
        );
    });

    it("handles heading level gaps (e.g. h1 then h3)", () => {
        const headings: Heading[] = [
            { level: 1, text: "Title", offset: 0 },
            { level: 3, text: "Deep Section", offset: 50 },
        ];
        expect(buildHeadingBreadcrumb(headings, 80, 100)).toBe(
            "# Title > ### Deep Section"
        );
    });

    it("returns same chain when start and end are in same section", () => {
        const headings: Heading[] = [
            { level: 1, text: "Title", offset: 0 },
            { level: 2, text: "Chapter 1", offset: 50 },
            { level: 2, text: "Chapter 2", offset: 200 },
        ];
        // Both start and end are under Chapter 1
        expect(buildHeadingBreadcrumb(headings, 80, 150)).toBe(
            "# Title > ## Chapter 1"
        );
    });
});
