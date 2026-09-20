import { z } from 'zod';
import { snapshotSchema, type Snapshot } from './model';
const statusSchema = z.object({ fullscreen: z.boolean(), visible: z.boolean(), renderedKey: z.string().max(180).nullable(), error: z.string().max(500).nullable() });
export type OutputStatus = z.infer<typeof statusSchema>;
const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('state'), state: snapshotSchema }),
  z.object({ type: z.literal('hello') }),
  z.object({ type: z.literal('bye') }),
  z.object({ type: z.literal('status'), status: statusSchema }),
  z.object({ type: z.literal('command'), command: z.enum(['fullscreen', 'exit-fullscreen', 'close']) }),
  z.object({ type: z.literal('navigate'), delta: z.union([z.literal(-1), z.literal(1)]) }),
]);
export type Message = z.infer<typeof messageSchema>;
const envelopeSchema = z.object({ app: z.literal('worship-v1'), session: z.string().uuid(), sender: z.string().uuid(), id: z.string().uuid(), message: messageSchema });
export function newerState(current: Snapshot, incoming: Snapshot) { return incoming.revision > current.revision ? incoming : current; }
export class SyncBus {
  private channel: BroadcastChannel | null = null;
  private sender = crypto.randomUUID();
  private seen = new Set<string>();
  peer: Window | null = null;
  constructor(private session: string, private receive: (message: Message) => void, private allowOutputReconnect = false) {
    if ('BroadcastChannel' in window) { this.channel = new BroadcastChannel(`worship:${session}`); this.channel.onmessage = event => this.accept(event.data); }
    window.addEventListener('message', this.onWindowMessage);
  }
  private onWindowMessage = (event: MessageEvent) => {
    if (event.origin !== location.origin) return;
    if (!this.peer && this.allowOutputReconnect) {
      // Recover the owned popup after an operator reload, even without BroadcastChannel.
      const envelope = envelopeSchema.safeParse(event.data);
      if (!envelope.success || envelope.data.session !== this.session || envelope.data.message.type !== 'hello') return;
      const source = event.source as Window | null;
      try {
        if (!source || source.opener !== window || source.name !== `worship-output-${this.session}` || source.location.pathname !== '/output') return;
        this.peer = source;
      } catch { return; }
    }
    if (!this.peer || event.source !== this.peer) return;
    this.accept(event.data);
  };
  private accept(data: unknown) {
    const parsed = envelopeSchema.safeParse(data); if (!parsed.success) return;
    const e = parsed.data;
    if (e.session !== this.session || e.sender === this.sender || this.seen.has(e.id)) return;
    this.seen.add(e.id); if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!);
    this.receive(e.message);
  }
  send(message: Message) {
    const payload = { app: 'worship-v1', session: this.session, sender: this.sender, id: crypto.randomUUID(), message };
    this.channel?.postMessage(payload);
    try { if (this.peer && !this.peer.closed) this.peer.postMessage(payload, location.origin); } catch { /* heartbeat exposes disconnected windows */ }
  }
  close() { this.channel?.close(); window.removeEventListener('message', this.onWindowMessage); }
}
