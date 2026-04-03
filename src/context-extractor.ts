export interface ContextResult {
    text: string;
    charStart: number;
    charEnd: number;
}

export function extractContext(
    content: string,
    targetStart: number,
    targetEnd: number,
    surrounding = 2
): ContextResult {
    // Split into paragraphs by double newline
    const paragraphs: Array<{ text: string; start: number; end: number }> = [];
    let pos = 0;
    const parts = content.split(/\n\n/);
    for (const part of parts) {
        paragraphs.push({
            text: part,
            start: pos,
            end: pos + part.length,
        });
        pos += part.length + 2; // +2 for the "\n\n"
    }

    // Find the paragraph containing the target
    let targetIdx = -1;
    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        if (targetStart >= p.start && targetStart < p.end + 2) {
            targetIdx = i;
            break;
        }
    }

    if (targetIdx === -1) {
        targetIdx = paragraphs.length - 1;
    }

    // Expand by surrounding paragraphs
    const startIdx = Math.max(0, targetIdx - surrounding);
    const endIdx = Math.min(paragraphs.length - 1, targetIdx + surrounding);

    const selectedParagraphs = paragraphs.slice(startIdx, endIdx + 1);
    const contextStart = selectedParagraphs[0].start;
    const contextEnd = selectedParagraphs[selectedParagraphs.length - 1].end;

    // Build text, excluding the template block itself
    let text = content.slice(contextStart, contextEnd);
    const templateInContext = content.slice(targetStart, targetEnd);
    text = text.replace(templateInContext, "").replace(/\n{3,}/g, "\n\n").trim();

    return {
        text,
        charStart: contextStart,
        charEnd: contextEnd,
    };
}
