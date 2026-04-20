import { onBeforeUnmount } from 'vue'

/**
 * Generic pointer-drag helper: calls onDelta with y-pixel delta since pointerdown.
 * Captures pointer, locks cursor to ns-resize while dragging.
 */
export function useDrag(onDelta: (deltaY: number, totalY: number) => void, onEnd?: () => void) {
  let startY = 0
  let totalY = 0
  let dragging = false

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    startY = e.clientY
    totalY = 0
    dragging = true
    document.body.style.cursor = 'ns-resize'
    e.preventDefault()
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return
    const delta = startY - e.clientY
    const change = delta - totalY
    totalY = delta
    onDelta(change, totalY)
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging) return
    dragging = false
    document.body.style.cursor = ''
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    onEnd?.()
  }

  onBeforeUnmount(() => {
    document.body.style.cursor = ''
  })

  return { onPointerDown, onPointerMove, onPointerUp }
}
