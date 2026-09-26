/* ============================================================
   AREA VM CONTROL TOWER V1 — Voice task input
   Row 8 of the spec: mic button + Web Speech API (SpeechRecognition),
   with a graceful fallback to the normal text input.
   Loaded before the views so any view can call SpeechKit.
   ============================================================ */

const SpeechKit = {
  supported() {
    try {
      return !!(window.SpeechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition);
    } catch (e) { return false; }
  },

  /* Start listening. Calls onResult(text) when a final transcript is ready,
     and onState('listening' | 'error' | 'unsupported') for UI feedback. */
  start(onResult, onState) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition;
    if (!SR) {
      if (onState) onState('unsupported');
      if (onResult) onResult('');
      return null;
    }
    try {
      const rec = new SR();
      rec.lang = LANG === 'ar' ? 'ar-EG' : 'en-GB';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onstart = () => { if (onState) onState('listening'); };
      rec.onerror = (e) => {
        if (onState) onState('error');
        if (e && e.error === 'not-allowed') toast(t('voiceDenied'));
      };
      rec.onresult = (e) => {
        const txt = [];
        for (let i = 0; i < e.results.length; i++) txt.push(e.results[i][0].transcript);
        if (onResult) onResult(txt.join(' ').trim());
        if (onState) onState('done');
      };
      rec.onend = () => { if (onState) onState('done'); };
      rec.start();
      return rec;
    } catch (e) {
      if (onState) onState('error');
      return null;
    }
  }
};
