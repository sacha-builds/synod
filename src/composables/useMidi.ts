import { onBeforeUnmount, onMounted, ref } from 'vue'

export interface MidiCallbacks {
  noteOn?: (note: number, velocity: number, channel: number) => void
  noteOff?: (note: number, channel: number) => void
  pitchBend?: (bend: number, channel: number) => void
  channelAftertouch?: (pressure: number, channel: number) => void
  polyAftertouch?: (note: number, pressure: number, channel: number) => void
  controlChange?: (cc: number, value: number, channel: number) => void
}

export type MidiStatus = 'unsupported' | 'pending' | 'denied' | 'ready'

/**
 * Web MIDI input wrapper. Requests access on mount, auto-attaches to all inputs,
 * and re-attaches when devices are plugged/unplugged.
 */
export function useMidi(callbacks: MidiCallbacks) {
  const status = ref<MidiStatus>('pending')
  const inputs = ref<{ id: string; name: string; manufacturer: string }[]>([])
  const lastMessageAt = ref(0)
  let access: MIDIAccess | null = null

  function handle(e: MIDIMessageEvent) {
    const data = e.data
    if (!data || data.length < 1) return
    lastMessageAt.value = performance.now()
    const status = data[0] & 0xf0
    const channel = data[0] & 0x0f

    switch (status) {
      case 0x80:
        callbacks.noteOff?.(data[1], channel)
        return
      case 0x90:
        if (data[2] === 0) callbacks.noteOff?.(data[1], channel)
        else callbacks.noteOn?.(data[1], data[2], channel)
        return
      case 0xa0:
        callbacks.polyAftertouch?.(data[1], data[2], channel)
        return
      case 0xb0:
        callbacks.controlChange?.(data[1], data[2], channel)
        return
      case 0xd0:
        callbacks.channelAftertouch?.(data[1], channel)
        return
      case 0xe0: {
        const raw = (data[2] << 7) | data[1]
        callbacks.pitchBend?.((raw - 8192) / 8192, channel)
        return
      }
    }
  }

  function refreshInputs() {
    if (!access) return
    const list: { id: string; name: string; manufacturer: string }[] = []
    access.inputs.forEach((input) => {
      input.onmidimessage = handle
      list.push({
        id: input.id,
        name: input.name ?? 'Unknown',
        manufacturer: input.manufacturer ?? '',
      })
    })
    inputs.value = list
  }

  async function init() {
    if (!navigator.requestMIDIAccess) {
      status.value = 'unsupported'
      return
    }
    try {
      access = await navigator.requestMIDIAccess({ sysex: false })
      access.onstatechange = refreshInputs
      refreshInputs()
      status.value = 'ready'
    } catch {
      status.value = 'denied'
    }
  }

  onMounted(init)

  onBeforeUnmount(() => {
    if (!access) return
    access.inputs.forEach((input) => {
      input.onmidimessage = null
    })
    access.onstatechange = null
    access = null
  })

  return { status, inputs, lastMessageAt }
}
