// Dialog lines. {name} = player name, {left} = things still to do.
export const GIVERS = {
  lights: { who: 'Mrs Holly', style: { coat: 'teal', hat: 'earmuffs', scarf: 'red' }, opts: { hair: '#c9c2b8' }, scale: 1.1 },
  bauble: { who: 'Pip', style: { coat: 'mustard', hat: 'bobble', scarf: 'striped' }, opts: { hair: '#4a2f1f' }, scale: 0.82 },
  scarf: { who: 'Ilse', style: { coat: 'cream', hat: 'bobble', scarf: 'white' }, opts: { hair: '#d9a35a' }, scale: 1.05 },
  star: { who: 'Bram', style: { coat: 'green', hat: 'earflap', scarf: 'red' }, opts: { hair: '#5c3a26', skin: '#e2b896' }, scale: 1.15 },
};

export const LINES = {
  lights: {
    accept: "Evening, {name}! The three houses with wreaths are still dark. Could you switch their lights on?",
    remind: "Look for the wreath doors on Holly Lane, {name}. {left} to go!",
    done: "Holly Lane is twinkling! Thank you, {name}. Merry Christmas!",
    after: "Doesn't the lane look cosy now, {name}?",
  },
  bauble: {
    accept: "{name}! I dropped my shiny red bauble in the snow. Can you find it? I think it rolled east!",
    remind: "It's red and shiny, by the trees on the east side of the park!",
    done: "My bauble! You're the best, {name}!",
    after: "I'm hanging it somewhere super high this time!",
  },
  scarf: {
    accept: "Brr! The wind blew my scarf onto the ice, {name}. Could you fetch it for me? Mind your step!",
    remind: "It's lying out on the ice, the striped one!",
    done: "Toasty again! Thank you so much, {name}.",
    after: "Fancy a skate later, {name}?",
  },
  star: {
    accept: "The big tree's star is waiting up at the top station, {name}. Hop in the cable car!",
    remind: "The cable car's right behind me. Up you go, {name}!",
    carrying: "Take that star down to the big tree in Market Square, {name}!",
    done: "What a star you are, {name}!",
    after: "Mind the sledges on your way down!",
  },
};

export function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}
