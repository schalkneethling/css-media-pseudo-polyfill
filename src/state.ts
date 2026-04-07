/**
 * Computes the current set of pseudo-class states for a media element
 * based on its playback, network, and user-interaction properties.
 *
 * @param element - The media element to inspect.
 * @param isStalledFlag - Whether a `stalled` event has fired since the last
 *   `progress` event, indicating the browser has not received new data.
 * @returns A set of pseudo-class name strings (e.g. "paused", "playing",
 *   "buffering", "stalled", "seeking", "muted") derived from the element's
 *   properties at the time of the call.
 */
export function computeStates(element: HTMLMediaElement, isStalledFlag: boolean): Set<string> {
  const states = new Set<string>();

  if (element.paused) {
    states.add("paused");
  } else if (
    // readyState: how much media data has been decoded and is ready for playback?
    // https://html.spec.whatwg.org/multipage/media.html#htmlmediaelement
    // HAVE_FUTURE_DATA (3) is the minimum needed to start or continue playback.
    // Anything below that means the element cannot play even though it is not paused.
    element.readyState < element.HAVE_FUTURE_DATA
  ) {
    if (isStalledFlag) {
      states.add("stalled");
    } else {
      states.add("buffering");
    }
  } else {
    states.add("playing");
  }

  if (element.seeking) {
    states.add("seeking");
  }

  if (element.muted) {
    states.add("muted");
  }

  return states;
}
