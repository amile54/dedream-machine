export function addTagsFromDraft(currentTags: string[], draft: string): string[] {
    const next = [...currentTags];
    const parts = draft
        .split(/[\s,，]+/)
        .map(tag => tag.trim())
        .filter(Boolean);

    for (const part of parts) {
        if (!next.includes(part)) next.push(part);
    }
    return next;
}

export function removeTagAt(tags: string[], index: number): string[] {
    return tags.filter((_, i) => i !== index);
}
