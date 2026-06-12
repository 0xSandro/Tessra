import { registerFace } from './registry.js';

// Word Clock — spells time out to the nearest 5-minute increment.
// "twenty past five", "quarter to nine", "ten o'clock".

const HOURS = [
  'twelve', 'one', 'two', 'three', 'four', 'five',
  'six', 'seven', 'eight', 'nine', 'ten', 'eleven'
];

function timePhrase(now, settings) {
  let h = now.getHours();
  let m = now.getMinutes();
  // Round to nearest 5 minutes; advance hour if we round up past 0
  m = Math.round(m / 5) * 5;
  if (m === 60) { m = 0; h = (h + 1) % 24; }

  const hourName     = HOURS[h % 12];
  const nextHourName = HOURS[(h + 1) % 12];

  if (m === 0)  return { top: 'It is',          mid: hourName,         bot: "o'clock" };
  if (m === 15) return { top: 'Quarter past',   mid: hourName,         bot: '' };
  if (m === 30) return { top: 'Half past',      mid: hourName,         bot: '' };
  if (m === 45) return { top: 'Quarter to',     mid: nextHourName,     bot: '' };

  const PHRASES = {
    5:  'Five past',     10: 'Ten past',
    20: 'Twenty past',   25: 'Twenty-five past',
    35: 'Twenty-five to', 40: 'Twenty to',
    50: 'Ten to',        55: 'Five to'
  };
  if (m < 30) return { top: PHRASES[m], mid: hourName,     bot: '' };
  return       { top: PHRASES[m], mid: nextHourName, bot: '' };
}

registerFace({
  id: 'word',
  label: 'Word Clock',
  mount(host, settings) {
    host.innerHTML = `
      <div class="clock-face clock-word">
        <div class="word-top"></div>
        <div class="word-mid"></div>
        <div class="word-bot"></div>
      </div>`;
    const topEl = host.querySelector('.word-top');
    const midEl = host.querySelector('.word-mid');
    const botEl = host.querySelector('.word-bot');
    return (now) => {
      const p = timePhrase(now, settings);
      topEl.textContent = p.top;
      midEl.textContent = p.mid;
      botEl.textContent = p.bot;
    };
  }
});
