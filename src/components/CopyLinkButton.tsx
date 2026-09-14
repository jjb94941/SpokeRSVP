"use client";

import { useState } from "react";
import { btnSecondary } from "./Ui";

export function CopyLinkButton({ url, label = "Copy RSVP link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this RSVP link:", url);
    }
  }

  return (
    <button type="button" className={btnSecondary} onClick={onCopy}>
      {copied ? "Copied to clipboard" : label}
    </button>
  );
}
