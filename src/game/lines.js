// Quest givers (one per Advent door) and their dialog lines. {name} = player name, {left} = things still to do,
// {next} = "Mrs Holly on Holly Lane" (whoever needs the player right now).
// Door 1–4 givers keep their task id (lights/bauble/scarf/star); 5–8 start a mini-game; 24 is the Mayor by the big tree.
export const GIVERS = {
  1: { who: 'Mrs Holly', task: 'lights', style: { coat: 'teal', hat: 'earmuffs', scarf: 'red' }, opts: { hair: '#c9c2b8' }, scale: 1.1 },
  2: { who: 'Pip', task: 'bauble', style: { coat: 'mustard', hat: 'bobble', scarf: 'striped' }, opts: { hair: '#4a2f1f' }, scale: 0.82 },
  3: { who: 'Ilse', task: 'scarf', style: { coat: 'cream', hat: 'bobble', scarf: 'white' }, opts: { hair: '#d9a35a' }, scale: 1.05 },
  4: { who: 'Bram', task: 'star', style: { coat: 'green', hat: 'earflap', scarf: 'red' }, opts: { hair: '#5c3a26', skin: '#e2b896' }, scale: 1.15 },
  5: { who: 'Tilly', game: 'snowball', style: { coat: 'teal', outfit: 'duffle', hat: 'none', hair: 'bunches', hairColor: 'ginger', scarf: 'red' }, opts: {}, scale: 0.84 },
  6: { who: 'Mr Pine', game: 'ornaments', style: { coat: 'forest', outfit: 'jumper', hat: 'none', hair: 'tousled', scarf: 'gold' }, opts: { hair: '#a49a92', skin: '#ecc7a6' }, scale: 1.14 },
  7: { who: 'Coach Sasha', game: 'sled', style: { coat: 'navy', outfit: 'jumper', hat: 'bobble', hair: 'long', hairColor: 'dark', scarf: 'red', skin: 'brown' }, opts: {}, scale: 1.1 },
  8: { who: 'Baker Bea', game: 'cookies', style: { coat: 'cream', outfit: 'dress', hat: 'none', hair: 'bob', hairColor: 'blonde', scarf: 'berry', skin: 'tan' }, opts: {}, scale: 1.06 },
  24: { who: 'Mayor Tinsel', style: { coat: 'plum', outfit: 'duffle', hat: 'none', hair: 'tousled', scarf: 'gold' }, opts: { hair: '#e8e2d8', skin: '#efcfb4' }, scale: 1.2 },
};

export const LINES = {
  1: {
    accept: "Hello, {name}! The three houses with wreaths are still dark. Could you switch their lights on?",
    remind: "Look for the wreath doors on Holly Lane, {name}. {left} to go!",
    done: "Holly Lane is twinkling! Thank you, {name}. Merry Christmas!",
    after: "Doesn't the lane look cosy now, {name}? Thank you again!",
  },
  2: {
    accept: "{name}! I dropped my shiny red bauble in the snow. Can you find it? I think it rolled east!",
    remind: "It's red and shiny, by the trees on the east side of the park!",
    done: "My bauble! You're the best, {name}!",
    after: "Thanks again, {name}! I'm hanging it somewhere super high this time!",
    locked: "Hi {name}! I'm building a snow fort right now. {next} needs you first!",
  },
  3: {
    accept: "Brr! The wind blew my scarf onto the ice, {name}. Could you fetch it for me? Mind your step!",
    remind: "It's lying out on the ice, the striped one!",
    done: "Toasty again! Thank you so much, {name}.",
    after: "My neck is lovely and warm, thanks to you, {name}. Fancy a skate later?",
    locked: "Brr, it's chilly by the lake! {next} could use a hand first, {name}.",
  },
  4: {
    accept: "The big tree's star is waiting up at the top station, {name}. Ride up, bring it down and keep it safe by the tree!",
    remind: "The cable car's right behind me. Up you go, {name}!",
    carrying: "Carry that star to the big tree in Market Square, {name}. There's a cushion waiting for it!",
    after: "That star's in good hands now, {name}. Thank you! Mind the sledges!",
    locked: "Hello, {name}! I'll need your help soon. {next} is waiting for you first.",
  },
  5: {
    accept: "{name}! Snowball fight! Hit the kids behind the forts, but not our snowman. Ready?",
    done: "Splat! You're a snowball champion, {name}!",
    replay: "Great throwing, {name}! Come back any time.",
    retry: "Ooh, so close! Talk to me for another go, {name}.",
    again: "A rematch, {name}? Let's go!",
    locked: "Psst, {name}! I'm still making snowballs. Help {next} first, then come and play!",
  },
  6: {
    accept: "Ah, {name}! I've hidden five knitted ornaments around the square. Can you find them all?",
    done: "Every last one! You've got sharp eyes, {name}.",
    replay: "Found them again! Well spotted, {name}.",
    retry: "A few are still hiding. Try again any time, {name}!",
    again: "I've hidden them somewhere new, {name}. Off you go!",
    locked: "Hi there, {name}! I'm still hiding ornaments. Pop back after you've helped {next}.",
  },
  7: {
    accept: "Ready to race, {name}? Steer down Sledge Hill, grab the gold stars and dodge the gnomes!",
    done: "What a run! You were flying, {name}!",
    replay: "Whoosh! Lovely run, {name}.",
    retry: "Shake off the snow and try again, {name}!",
    again: "Back on the sled, {name}? Beat your best!",
    locked: "Hey {name}! The race course isn't ready yet. Go and help {next} first!",
  },
  8: {
    accept: "Welcome to my bakery, {name}! Let's cut, bake and decorate some Christmas cookies.",
    done: "Mmm, they smell wonderful! You're a born baker, {name}.",
    replay: "Another tray of beauties, {name}!",
    retry: "A little crispy round the edges! Shall we try another batch, {name}?",
    again: "Another batch, {name}? The oven's nice and warm!",
    locked: "Hello, {name}! The oven is still warming up. Come back after you've helped {next}.",
  },
  24: {
    greet: "Welcome to Tinselby, {name}! On Christmas Eve our star goes on top of the tree. Every Advent door brings that night closer!",
    resting: "Our star is safe on its cushion, {name}. On Christmas Eve, we'll place it together!",
    starHome: "Splendid, {name}! The star can rest on this cushion until Christmas Eve.",
    open: "It's Christmas Eve, {name}! Will you place the star on top of our tree?",
    after: "Merry Christmas, {name}! Tinselby has never looked so bright.",
  },
};

export function fill(text, vars) {
  return String(text || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}
