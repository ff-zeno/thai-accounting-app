/**
 * Route constants for the two document sections.
 *
 * `documents.direction` splits one table across two nav sections, so the
 * direction→route mapping has to agree in every link, redirect and
 * `revalidatePath` call. It lives here rather than as a repeated
 * `direction === "expense" ? … : …` ternary so the mapping is one edit.
 *
 * `/documents/[docId]/review` deliberately keeps its own prefix. Review is
 * direction-agnostic — direction comes off the DB row, not the URL — and it
 * is deep-linked from the dashboard, the bank transaction table, the WHT
 * register and the exception queue. It is a stable resource URL, not a
 * section.
 */

export type DocumentDirection = "expense" | "income";

/** Section home for a direction: the list of documents on that side. */
export function documentListRoute(direction: DocumentDirection): string {
  return direction === "expense" ? "/expenses" : "/income";
}

/** Upload surface for a direction, inside that direction's section. */
export function documentUploadRoute(direction: DocumentDirection): string {
  return `${documentListRoute(direction)}/upload`;
}

/** Direction-agnostic review URL for one document. */
export function documentReviewRoute(docId: string): string {
  return `/documents/${docId}/review`;
}
