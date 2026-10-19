// Hands question ids from the reports screen to the play screen, which starts a review game with them.
// The ids are kept until the play screen takes them, so a review starts once and is not repeated by accident.

let pending = null;

export function requestReview(ids) {
  pending = [...ids];
}

export function takeReview() {
  const ids = pending;
  pending = null;
  return ids;
}
