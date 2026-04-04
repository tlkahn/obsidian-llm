export interface Heading {
    level: number;
    text: string;
    offset: number;
}

function formatHeading(h: Heading): string {
    return "#".repeat(h.level) + " " + h.text;
}

function ancestorChain(headings: Heading[], offset: number): Heading[] {
    const stack: Heading[] = [];
    for (const h of headings) {
        if (h.offset >= offset) break;
        // Pop headings at same or deeper level
        while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
            stack.pop();
        }
        stack.push(h);
    }
    return stack;
}

export function buildHeadingBreadcrumb(
    headings: Heading[],
    startOffset: number,
    endOffset: number
): string {
    if (headings.length === 0) return "";

    const startChain = ancestorChain(headings, startOffset);
    const endChain = ancestorChain(headings, endOffset);

    if (startChain.length === 0) return "";

    // Find common prefix
    let commonLen = 0;
    while (
        commonLen < startChain.length &&
        commonLen < endChain.length &&
        startChain[commonLen].level === endChain[commonLen].level &&
        startChain[commonLen].text === endChain[commonLen].text
    ) {
        commonLen++;
    }

    // If chains are identical, just format the chain
    if (commonLen === startChain.length && commonLen === endChain.length) {
        return startChain.map(formatHeading).join(" > ");
    }

    // Chains diverge at commonLen — show common prefix then range
    const common = startChain.slice(0, commonLen).map(formatHeading);
    const startLeaf = startChain[commonLen];
    const endLeaf = endChain[commonLen];

    if (startLeaf && endLeaf) {
        common.push(formatHeading(startLeaf) + " … " + formatHeading(endLeaf));
    } else if (startLeaf) {
        common.push(formatHeading(startLeaf));
    }

    return common.join(" > ");
}
