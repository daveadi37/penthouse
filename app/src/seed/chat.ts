import type { ChatMessage } from '@/types';

/* ============================================================
   The house chat, seeded.

   Written as the real traffic of one week rather than as filler: a
   standing notice at the top, stock running out, a car off the road for
   a morning, a delivery nobody has claimed. Generic sample messages
   would make the screen look finished and teach nobody what it is for —
   these are the kind of thing that goes wrong when it is said out loud
   to one person in a corridor and to nobody else.
   ============================================================ */

/** Hours ago, so the thread is always recent whenever the app is opened. */
const h = (n: number) => Date.now() - n * 36e5;

export const SEED_CHAT: ChatMessage[] = [
  {
    id: 'ch-1',
    by: 'p-earl',
    at: h(122),
    text: 'Shrien is back from the UK on Tuesday. The flight lands at 21:40 and he will come straight to the flat — Marvin, leave for the airport by 20:30. Rosie, please do the main bedroom on Monday rather than Tuesday.',
    pinned: true,
    pinnedBy: 'p-earl',
  },
  {
    id: 'ch-2',
    by: 'p-rosie',
    at: h(46),
    text: 'We are down to one bag of atta and about half a kilo of basmati. Both are on the buy list. Milk will not see out Thursday either, we are going through four litres a day with everyone home.',
  },
  {
    id: 'ch-3',
    by: 'p-marvin',
    at: h(29),
    text: 'The car is booked in for its service on Thursday, 08:00 at Al Quoz, and it will be there most of the morning. Nothing that needs the car before one o’clock please.',
  },
  {
    id: 'ch-4',
    by: 'p-aditya',
    at: h(21),
    text: 'I am working from the flat all week and on calls in the study between ten and one. Rosie — one vegetarian portion at lunch is just for me, everyone else as normal.',
  },
  {
    id: 'ch-5',
    by: 'p-salyna',
    at: h(7),
    text: 'Two boxes came from Amazon at four. I have left them by the console table in the hall. One of them is Charlie’s.',
  },
  {
    id: 'ch-6',
    by: 'p-marvin',
    at: h(2),
    text: 'Understood on Tuesday. I will do the school run first on Thursday and go to the garage straight from there.',
  },
];
