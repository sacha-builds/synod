import { onBeforeUnmount, ref } from 'vue'

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
  const isDragging = ref(false)
  let startY = 0
  let totalY = 0

  function onWindowMove(e: PointerEvent) {
    if (!isDragging.value) return
    // If the user released the button outside the window, we may never get a
    // pointerup. Every move event, check that buttons are still held; if not,
    // treat as release. This is the most reliable cross-browser safeguard.
    if (e.buttons === 0) {
      onWindowUp()
      return
    }
    const delta = startY - e.clientY
    const change = delta - totalY
    totalY = delta
    onDelta(change, totalY)
  }

  function onWindowUp() {
    if (!isDragging.value) return
    isDragging.value = false
    document.body.style.cursor = ''
    window.removeEventListener('pointermove', onWindowMove)
    window.removeEventListener('pointerup', onWindowUp)
    window.removeEventListener('pointercancel', onWindowUp)
    window.removeEventListener('blur', onWindowUp)
    onEnd?.()
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    startY = e.clientY
    totalY = 0
    isDragging.value = true
    document.body.style.cursor = 'ns-resize'
    window.addEventListener('pointermove', onWindowMove)
    window.addEventListener('pointerup', onWindowUp)
    window.addEventListener('pointercancel', onWindowUp)
    window.addEventListener('blur', onWindowUp)
    e.preventDefault()
  }

  onBeforeUnmount(() => {
    document.body.style.cursor = ''
    window.removeEventListener('pointermove', onWindowMove)
    window.removeEventListener('pointerup', onWindowUp)
    window.removeEventListener('pointercancel', onWindowUp)
    window.removeEventListener('blur', onWindowUp)
  })

  return { onPointerDown, isDragging }
}
