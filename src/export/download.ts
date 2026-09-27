export function downloadBlob(blob: Blob, filename: string, doc: Document = document): void {
    const url = URL.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    doc.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked later, not at once: some browsers start the download after click() returns.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
