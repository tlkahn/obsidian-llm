export interface TemplateBlock {
    instruction: string;
    charStart: number;
    charEnd: number;
    fullMatch: string;
}

export function parseTemplates(content: string): TemplateBlock[] {
    // Find all fenced code block ranges to exclude
    const codeRanges: Array<{ start: number; end: number }> = [];
    const fenceRegex = /^```[^\n]*\n[\s\S]*?^```/gm;
    let fenceMatch;
    while ((fenceMatch = fenceRegex.exec(content)) !== null) {
        codeRanges.push({
            start: fenceMatch.index,
            end: fenceMatch.index + fenceMatch[0].length,
        });
    }

    const results: TemplateBlock[] = [];
    const templateRegex = /\{\{llm:\s*([\s\S]*?)\}\}/g;
    let match;
    while ((match = templateRegex.exec(content)) !== null) {
        const charStart = match.index;
        const charEnd = match.index + match[0].length;

        // Skip if inside a code fence
        const insideCode = codeRanges.some(
            (r) => charStart >= r.start && charEnd <= r.end
        );
        if (insideCode) continue;

        results.push({
            instruction: match[1].trim(),
            charStart,
            charEnd,
            fullMatch: match[0],
        });
    }

    return results;
}
