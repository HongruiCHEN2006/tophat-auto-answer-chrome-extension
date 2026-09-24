(function (root) {
  "use strict";
  function detectDragInteractionType(container) {
    if (!container) return "UNKNOWN_DRAG";
    if (root.THAA.queryFirst(container, root.THAA.SELECTORS.matchingSelects)) return "SELECT_OR_DROPDOWN_MATCHING";
    const declared = container.dataset?.dragType || container.querySelector?.("[data-drag-type]")?.dataset?.dragType;
    const allowed = ["NATIVE_HTML5_DRAG", "POINTER_EVENT_DRAG", "MOUSE_EVENT_DRAG", "SELECT_OR_DROPDOWN_MATCHING", "DIRECT_DOM_SORTABLE", "FRAMEWORK_MANAGED_DRAG", "UNKNOWN_DRAG"];
    if (allowed.includes(declared)) return declared;
    if (container.querySelector?.("[draggable='true']")) return "NATIVE_HTML5_DRAG";
    if (container.querySelector?.("[data-rbd-draggable-id], [class*='dnd'], [class*='drag']")) return "FRAMEWORK_MANAGED_DRAG";
    if (container.querySelector?.("[role='listitem'][aria-grabbed], [data-pointer-sortable]")) return "POINTER_EVENT_DRAG";
    if (container.querySelector?.("[data-mouse-sortable]")) return "MOUSE_EVENT_DRAG";
    if (container.dataset?.directSortable === "true") return "DIRECT_DOM_SORTABLE";
    return "UNKNOWN_DRAG";
  }
  function directSort(scope, order) {
    const nodes = root.THAA.queryAll(scope, root.THAA.SELECTORS.sortingItems);
    const byId = new Map(nodes.map((node, i) => [root.THAA.itemId(node, i, "I"), node]));
    for (const id of order) { const node = byId.get(id); if (!node) return false; scope.appendChild(node); }
    scope.dataset.thaaVerifiedOrder = order.join("|");
    scope.dispatchEvent(new CustomEvent("thaa:sorted", { bubbles: true, detail: { order } }));
    return true;
  }
  async function sortingAdapter(question, result, container, options = {}) {
    const scope = root.THAA.queryFirst(container, root.THAA.SELECTORS.sortingContainers) || container;
    const interactionType = detectDragInteractionType(scope);
    let attempted = false;
    if (interactionType === "NATIVE_HTML5_DRAG" && typeof DataTransfer !== "undefined") {
      const nodes = root.THAA.queryAll(scope, root.THAA.SELECTORS.sortingItems);
      const byId = new Map(nodes.map((n, i) => [root.THAA.itemId(n, i, "I"), n]));
      for (const id of result.order) {
        const node = byId.get(id), target = scope.lastElementChild;
        if (!node || !target) continue;
        const data = new DataTransfer();
        node.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: data }));
        target.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: data }));
        node.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: data }));
      }
      attempted = true;
    } else if (interactionType === "DIRECT_DOM_SORTABLE") attempted = directSort(scope, result.order);
    if (root.THAA.verifyInteraction(question, result, container)) return { success: true, interactionType };
    const initialReason = attempted ? "Drag completed visually but application state was not verified" : `${interactionType} could not be automated safely`;
    if (options.allowTestFallback && directSort(scope, result.order) && root.THAA.verifyInteraction(question, result, container)) {
      return { success: true, interactionType, fallbackUsed: true, initialFailureReason: initialReason };
    }
    return { success: false, interactionType, reason: initialReason, verificationFailed: attempted };
  }
  root.THAA = root.THAA || {};
  Object.assign(root.THAA, { detectDragInteractionType, directSort, sortingAdapter });
})(globalThis);
