// Thin socket.io-style wrapper around PartySocket so the rest of the app
// (which was written against socket.io) doesn't need to change.
//
// PartyKit routes connections by room ID. socket.connect(code) opens a new
// websocket to that specific party (room). socket.disconnect() closes it.
import PartySocket from 'partysocket';

const HOST = import.meta.env.VITE_PARTYKIT_HOST || '127.0.0.1:1999';

let ps = null;
const listeners = new Map(); // event -> Set<handler>
const state = { id: null, connected: false };

function emitLocal(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const h of [...set]) {
    try { h(payload); } catch (e) { console.error(e); }
  }
}

export const socket = {
  get connected() { return state.connected; },
  get id() { return state.id; },

  on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
  },
  off(event, handler) {
    listeners.get(event)?.delete(handler);
  },

  /**
   * Send a typed message to the server.
   * Mirrors socket.io's `emit(event, payload)` — no ack callback support.
   */
  emit(event, payload) {
    if (!ps || ps.readyState !== WebSocket.OPEN) return;
    ps.send(JSON.stringify({ type: event, payload }));
  },

  /** Open a websocket to the given room (4-char code). */
  connect(room) {
    if (ps) ps.close();
    state.id = null;
    state.connected = false;

    ps = new PartySocket({ host: HOST, room });

    ps.addEventListener('open', () => {
      state.connected = true;
      emitLocal('connect');
    });
    ps.addEventListener('close', () => {
      state.connected = false;
      emitLocal('disconnect');
    });
    ps.addEventListener('message', (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }
      // intercept the server's "you connected, here's your id" message
      if (data.type === 'connect:ready') {
        state.id = data.payload?.id || null;
        emitLocal('connect:ready', data.payload);
        return;
      }
      emitLocal(data.type, data.payload);
    });
  },

  disconnect() {
    if (ps) ps.close();
    ps = null;
    state.id = null;
    state.connected = false;
  },
};
