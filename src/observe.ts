import { PSEUDO_CLASSES, CLASS_PREFIX, MEDIA_EVENTS } from "./constants.js";
import { computeStates } from "./state.js";

interface ElementState {
  handler: EventListener;
  isCurrentlyStalled: boolean;
}

const elementStates = new WeakMap<HTMLMediaElement, ElementState>();

function isMediaElement(node: Node): node is HTMLMediaElement {
  const tagName = (node as Element).tagName;
  return tagName === "VIDEO" || tagName === "AUDIO";
}

function computeAndApply(element: HTMLMediaElement, unsupported: Set<string>): void {
  const state = elementStates.get(element);
  if (!state) {
    return;
  }

  const activeStates = computeStates(element, state.isCurrentlyStalled);

  for (const name of PSEUDO_CLASSES) {
    if (!unsupported.has(name)) {
      continue;
    }
    const className = `${CLASS_PREFIX}${name}`;
    element.classList.toggle(className, activeStates.has(name));
  }
}

function attachListeners(element: HTMLMediaElement, unsupported: Set<string>): void {
  if (elementStates.has(element)) {
    return;
  }

  const state: ElementState = {
    handler: () => {},
    isCurrentlyStalled: false,
  };

  const handler: EventListener = (event: Event) => {
    switch (event.type) {
      case "stalled":
        state.isCurrentlyStalled = true;
        break;
      case "progress":
      case "emptied":
      case "loadstart":
        state.isCurrentlyStalled = false;
        break;
    }
    computeAndApply(element, unsupported);
  };

  state.handler = handler;
  elementStates.set(element, state);

  for (const eventType of MEDIA_EVENTS) {
    element.addEventListener(eventType, handler);
  }

  computeAndApply(element, unsupported);
}

function detachListeners(element: HTMLMediaElement): void {
  const state = elementStates.get(element);
  if (!state) {
    return;
  }

  for (const eventType of MEDIA_EVENTS) {
    element.removeEventListener(eventType, state.handler);
  }

  elementStates.delete(element);
}

function discoverMediaElements(node: Node, unsupported: Set<string>): void {
  // The node itself may be a media element (e.g., <video> added directly)
  if (isMediaElement(node)) {
    attachListeners(node, unsupported);
  }

  // The node may be a container (e.g., <div>) with media elements nested inside.
  // Only Element nodes (nodeType 1) have querySelectorAll — text and comment
  // nodes can also appear in MutationObserver records.
  if (node.nodeType === 1) {
    const mediaElements = (node as Element).querySelectorAll("audio, video");
    for (const mediaElement of mediaElements) {
      attachListeners(mediaElement as HTMLMediaElement, unsupported);
    }
  }
}

function cleanupMediaElements(node: Node): void {
  if (isMediaElement(node)) {
    detachListeners(node);
  }

  // Walk the subtree for nested media elements (see discoverMediaElements)
  if (node.nodeType === 1) {
    const mediaElements = (node as Element).querySelectorAll("audio, video");
    for (const mediaElement of mediaElements) {
      detachListeners(mediaElement as HTMLMediaElement);
    }
  }
}

/**
 * Discovers media elements in the DOM, attaches event listeners, and
 * toggles polyfill classes based on computed state. Sets up a
 * MutationObserver to handle dynamically added and removed elements.
 *
 * @param unsupported - The set of pseudo-class names that need polyfilling.
 */
export function observeMediaElements(unsupported: Set<string>): void {
  const existingElements = document.querySelectorAll("audio, video");
  for (const element of existingElements) {
    attachListeners(element as HTMLMediaElement, unsupported);
  }

  const observer = new MutationObserver((mutations: MutationRecord[]) => {
    for (const mutation of mutations) {
      for (const addedNode of mutation.addedNodes) {
        discoverMediaElements(addedNode, unsupported);
      }
      for (const removedNode of mutation.removedNodes) {
        cleanupMediaElements(removedNode);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
