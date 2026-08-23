/**
 * How a link looks everywhere in the app.
 *
 * One string rather than three near-copies. The copies had drifted: table
 * cells carried a focus ring, detail rows did not, so tabbing through a
 * client's details moved an invisible cursor. Styling that is written out by
 * hand in each place drifts exactly like that — quietly, and only for the
 * people least able to report it.
 */
export const LINK_CLASS =
  "rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
