"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  clearDraft,
  draftFrom,
  readDraft,
  writeDraft,
  type Draft,
} from "./draft";

/**
 * Holds an unfinished review in the browser and puts it back on return.
 *
 * Works against the form's DOM rather than React state on purpose: both review
 * forms are uncontrolled, which is what lets the star ratings be plain radios
 * that a keyboard and a screen reader already understand. Turning every field
 * into controlled state just to save a draft would be a large step backwards
 * for a small feature.
 */
export function useFormDraft(key: string, enabled: boolean) {
  const ref = useRef<HTMLFormElement>(null);

  const save = useCallback(() => {
    if (!enabled || !ref.current) return;
    writeDraft(window.localStorage, key, draftFrom(new FormData(ref.current)));
  }, [key, enabled]);

  const clear = useCallback(() => {
    clearDraft(window.localStorage, key);
  }, [key]);

  useEffect(() => {
    const form = ref.current;
    if (!enabled || !form) return;

    const draft = readDraft(window.localStorage, key);
    if (draft) applyDraft(form, draft);

    /*
     * Listened for natively rather than through React's onChange, which does
     * not fire on this form — it carries a server action, and the restore
     * above proves the ref is live while nothing was ever saved. A native
     * listener on the form catches input and change bubbling from every
     * control in it, whatever React does with its own event system.
     */
    const persist = () =>
      writeDraft(window.localStorage, key, draftFrom(new FormData(form)));
    form.addEventListener("input", persist);
    form.addEventListener("change", persist);
    return () => {
      form.removeEventListener("input", persist);
      form.removeEventListener("change", persist);
    };
  }, [key, enabled]);

  return { ref, save, clear };
}

/**
 * Puts saved values back into the fields.
 *
 * Anything the form no longer has is skipped rather than recreated: a draft
 * can outlive a change to the questions, and a stale answer to a question that
 * is gone should disappear with it.
 */
function applyDraft(form: HTMLFormElement, draft: Draft) {
  for (const [name, value] of Object.entries(draft)) {
    const fields = form.elements.namedItem(name);
    if (!fields) continue;

    if (fields instanceof RadioNodeList) {
      for (const node of Array.from(fields)) {
        if (node instanceof HTMLInputElement) node.checked = node.value === value;
      }
      continue;
    }
    if (
      fields instanceof HTMLInputElement ||
      fields instanceof HTMLTextAreaElement ||
      fields instanceof HTMLSelectElement
    ) {
      if (fields instanceof HTMLInputElement && fields.type === "radio") {
        fields.checked = fields.value === value;
      } else if (fields instanceof HTMLInputElement && fields.type === "checkbox") {
        fields.checked = true;
      } else {
        fields.value = value;
      }
    }
  }
}
