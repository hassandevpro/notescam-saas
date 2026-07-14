// Tests du moteur pur de notifications.  node src/lib/_notificationEngine.test.mjs
import {
  NOTIFICATION_CHANNELS, CHANNEL_IMPLEMENTED, normalizeMessage, createDispatcher, summarize,
} from './notificationEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// --- Canaux prévus, interne seul implémenté ---------------------------------
ok(NOTIFICATION_CHANNELS.join(',') === 'internal,email,sms,whatsapp', '4 canaux prévus');
ok(CHANNEL_IMPLEMENTED.internal === true, 'canal interne implémenté');
ok(!CHANNEL_IMPLEMENTED.email && !CHANNEL_IMPLEMENTED.sms && !CHANNEL_IMPLEMENTED.whatsapp, 'email/sms/whatsapp non implémentés (prévus)');

// --- Normalisation -----------------------------------------------------------
ok(normalizeMessage({}).channels.join(',') === 'internal', 'défaut = canal interne');
ok(normalizeMessage({ channels: ['sms', 'inconnu', 'email'] }).channels.join(',') === 'sms,email', 'canaux inconnus filtrés');

// --- Dispatch : handlers injectés -------------------------------------------
{
  const calls = [];
  const dispatcher = createDispatcher({
    internal: async ({ recipient }) => { calls.push('internal:' + (recipient?.id || '*')); return { status: 'delivered' }; },
    email:    async () => ({ status: 'queued' }),
  });
  const res = await dispatcher.dispatch({
    title: 'Test', channels: ['internal', 'email', 'sms'],
    recipients: [{ id: 'u1' }, { id: 'u2' }],
  });
  // 2 destinataires × 3 canaux = 6 résultats.
  ok(res.length === 6, '2 destinataires × 3 canaux = 6 résultats');
  ok(res.filter((r) => r.channel === 'internal' && r.status === 'delivered').length === 2, 'interne délivré pour chacun');
  ok(res.filter((r) => r.channel === 'email' && r.status === 'queued').length === 2, 'email mis en file');
  ok(res.filter((r) => r.channel === 'sms' && r.status === 'unsupported').length === 2, 'sms sans handler = unsupported');
  ok(calls.length === 2, 'handler interne appelé pour chaque destinataire');
}

// --- Diffusion (sans destinataire ciblé) ------------------------------------
{
  const dispatcher = createDispatcher({ internal: async () => ({ status: 'delivered' }) });
  const res = await dispatcher.dispatch({ title: 'Broadcast' });
  ok(res.length === 1 && res[0].recipient === null, 'diffusion = un seul envoi (destinataire null)');
}

// --- Isolation des échecs ----------------------------------------------------
{
  const dispatcher = createDispatcher({ internal: async () => { throw new Error('boom'); } });
  const res = await dispatcher.dispatch({ title: 'X', recipients: [{ id: 'u1' }] });
  ok(res[0].status === 'failed' && res[0].error === 'boom', 'handler en échec isolé (status failed)');
}

// --- Résumé ------------------------------------------------------------------
ok(summarize([{ channel: 'internal' }, { channel: 'internal' }, { channel: 'email' }]).internal === 2, 'résumé par canal');

console.log(failed ? '\n❌ Notification engine KO' : '\n✅ Notification engine OK');
process.exit(failed ? 1 : 0);
