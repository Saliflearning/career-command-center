"use client";

import { useState } from "react";
import { CopyIcon, CheckIcon } from "lucide-react";

export default function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        readOnly
        value={link}
        className="flex-1 bg-surface-container border border-outline-variant rounded-lg px-4 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/40"
      />
      <button
        onClick={handleCopy}
        className="bg-primary text-white p-2.5 rounded-lg hover:opacity-90 transition-all flex items-center gap-1.5 shrink-0"
        aria-label="Copy referral link"
      >
        {copied ? (
          <>
            <CheckIcon className="w-4 h-4" />
            <span className="hidden md:inline text-xs font-medium">Copied!</span>
          </>
        ) : (
          <>
            <CopyIcon className="w-4 h-4" />
            <span className="hidden md:inline text-xs font-medium">Copy</span>
          </>
        )}
      </button>
    </div>
  );
}
