export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // The browser needs the object URL until it has started the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export function safeDocumentFilename(name: string): string {
  const printable = Array.from(name, (character) => character.codePointAt(0)! < 32 ? "_" : character).join("");
  return printable.replace(/[<>:"/\\|?*]/g, "_").replace(/\.+$/g, "").trim().slice(0, 120) || "CV";
}
