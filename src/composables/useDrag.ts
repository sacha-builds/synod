import { onBeforeUnmount } from 'vue'

/**
 * Pointer-drag helper. Attaches move/up listeners to the window only while a
 * drag is in progress, which keeps the drag sticky (cursor can leave the
 * element) and guarantees a release is seen even if the pointer exits.
 *
 * Using element-level pointermove/pointerup with setPointerCapture can leave
 * a component stuck in "dragging" when the release event is missed — so we
 * avoid that pattern entirely.
 */
export function useDrag(onDelta: (deltaY: number, totalY: number) => void, onEnd?: () => void) {
  let startY = 0
  let totalY = 0
  let dragging = false

  function onWindowMove(e: PointerEvent) {
    if (!dragging) return
    const delta = startY - e.clientY
    const change = delta - totalY
    totalY = delta
    onDelta(change, totalY)
  }

  function onWindowUp() {
    if (!dragging) return
    dragging = false
    document.body.style.cursor = ''
    window.removeEventListener('pointermove', onWindowMove)
    window.removeEventListener('pointerup', onWindowUp)
    window.removeEventListener('pointercancel', onWindowUp)
    onEnd?.()
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    startY = e.clientY
    totalY = 0
    dragging = true
    document.body.style.cursor = 'ns-resize'
    window.addEventListener('pointermove', onWindowMove)
    window.addEventListener('pointerup', onWindowUp)
    window.addEventListener('pointercancel', onWindowUp)
    e.preventDefault()
  }

  onBeforeUnmount(() => {
    document.body.style.cursor = ''
    window.removeEventListener('pointermove', onWindowMove)
    window.removeEventListener('pointerup', onWindowUp)
    window.removeEventListener('pointercancel', onWindowUp)
  })

  return { onPointerDown }
}
