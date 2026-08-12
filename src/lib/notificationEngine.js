// Moteur GÉNÉRIQUE de notifications (PUR : orchestration, handlers injectés →
// testable en Node). Multi-CANAUX : interne, email, SMS, WhatsApp.
//
// Cette itération n'IMPLÉMENTE que le canal INTERNE ; les autres sont PRÉVUS
// (canaux déclarés + mis en file d'attente par le service), mais pas envoyés.
// L'orchestration ne connaît pas l'I/O : chaque canal est une fonction handler
// fournie par le service (notificationService.js).

export const NOTIFICATION_CHANNELS = ['internal', 'email', 'sms', 'whatsapp'];

// État d'implémentation par canal (piloté par le service ; défaut = interne seul).
export const CHANNEL_IMPLEMENTED = { internal: true, email: false, sms: false, whatsapp: false };

// Priorité d'une notification — décide si le SMS (coûteux) est autorisé :
// 'normal' (défaut) ne l'atteint jamais ; 'important'/'urgent' cf. externalHandler
// (mise en file) et l'edge notify-dispatch (décision finale, budget compris).
export const NOTIFICATION_PRIORITIES = ['normal', 'important', 'urgent'];

// Normalise un message + filtre les canaux inconnus (défaut : interne).
export function normalizeMessage(msg = {}) {
  const channels = (msg.channels && msg.channels.length ? msg.channels : ['internal'])
    .filter((c) => NOTIFICATION_CHANNELS.includes(c));
  return {
    type: msg.type || 'info',
    title: msg.title || '',
    body: msg.body || '',
    link: msg.link || null,
    channels: channels.length ? channels : ['internal'],
    recipients: Array.isArray(msg.recipients) ? msg.recipients : [],
    priority: NOTIFICATION_PRIORITIES.includes(msg.priority) ? msg.priority : 'normal',
  };
}

// Fabrique un dispatcher à partir d'un registre de handlers { canal: fn }.
// `handler({ recipient, message })` renvoie { status, ... }.
export function createDispatcher(handlers = {}) {
  async function dispatch(msg) {
    const m = normalizeMessage(msg);
    const results = [];
    // Une notification sans destinataire ciblé = diffusion (un seul « envoi »).
    const recipients = m.recipients.length ? m.recipients : [null];
    for (const recipient of recipients) {
      for (const channel of m.channels) {
        const handler = handlers[channel];
        if (!handler) { results.push({ recipient, channel, status: 'unsupported' }); continue; }
        try {
          const r = await handler({ recipient, message: m });
          results.push({ recipient, channel, ...(r || { status: 'ok' }) });
        } catch (e) {
          results.push({ recipient, channel, status: 'failed', error: e?.message || String(e) });
        }
      }
    }
    return results;
  }
  return { dispatch };
}

// Résumé { canal: nb } d'un lot de résultats (pour logs / UI).
export function summarize(results = []) {
  const out = {};
  for (const r of results) out[r.channel] = (out[r.channel] || 0) + 1;
  return out;
}
