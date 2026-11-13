// Just-for-fun fan quiz. Each answer maps to an element: W=Water, E=Earth, F=Fire, A=Air.
window.BQ_QUESTIONS = [
 {q:"It's your first night at a new life group. You're probably…", a:{
  W:"Sitting next to the new person so they don't feel alone",
  E:"Showing up early to help set out chairs and snacks",
  F:"Volunteering to share first so the room loosens up",
  A:"Turning the icebreaker into a game everyone's laughing at"}},
 {q:"Worship night is starting. Where do we find you?", a:{
  W:"Eyes closed, totally lost in the song (tissues nearby)",
  E:"Same spot as always, rooted and steady all night",
  F:"Front row, hands up, singing at full volume",
  A:"Free and moving, maybe dancing in the back"}},
 {q:"Pick your serving team:", a:{
  W:"Prayer team or care ministry, holding space for people",
  E:"Setup and teardown, because someone's gotta stack the chairs",
  F:"Up front: leading, hosting, or hyping the room",
  A:"Kids ministry, where creativity and silly voices are a must"}},
 {q:"Your friend texts, \"rough week, can you pray for me?\" You…", a:{
  W:"Call them right away and just listen",
  E:"Show up with food and a plan to help",
  F:"Send a bold voice memo prayer over them, right now",
  A:"Send a verse, a meme, and a reminder they're loved"}},
 {q:"Sunday after church, the crew is grabbing lunch. You're the one who…", a:{
  W:"Notices who's standing alone and invites them along",
  E:"Already knows the spot that fits everyone's budget",
  F:"Starts a friendly debate about the sermon",
  A:"Somehow turns lunch into an afternoon adventure"}},
 {q:"Which Bible scene fires you up the most?", a:{
  W:"Jesus walking on the water",
  E:"Nehemiah rebuilding the wall, one brick at a time",
  F:"Elijah calling down fire on Mount Carmel",
  A:"Pentecost and the sound of a rushing wind"}},
 {q:"Outreach day! Your favorite way to love the city:", a:{
  W:"Sitting down with someone and hearing their story",
  E:"Hands-on work like building, cleaning, or packing boxes",
  F:"Sharing your testimony with anyone who will listen",
  A:"Leading a fun block party where everyone feels welcome"}},
 {q:"How do you pray best?", a:{
  W:"Journaling, honest and heartfelt",
  E:"Same time, same chair, every morning",
  F:"Out loud, passionate, sometimes pacing the room",
  A:"On a walk outside, talking with God as you go"}},
 {q:"Retreat weekend! You're most excited for…", a:{
  W:"The lake, plus deep talks on the dock",
  E:"The cabin, the bonfire setup, and the cooking crew",
  F:"Late-night worship and the competitive games",
  A:"The free time, the stargazing, and the surprises"}},
 {q:"Someone in your group is going through it. Your way of encouraging them:", a:{
  W:"Gentle check-ins and a safe place to cry",
  E:"Being there consistently, week after week",
  F:"Speaking life and reminding them who they are",
  A:"Getting them out of the house and laughing again"}},
 {q:"Which fruit of the Spirit shows up most in you?", a:{
  W:"Kindness and gentleness",
  E:"Faithfulness and self-control",
  F:"Love and joy",
  A:"Peace and patience"}},
 {q:"Pick the verse that feels most like you:", a:{
  W:"\"Whoever drinks the water I give them will never thirst.\" (John 4:14)",
  E:"\"The wise man built his house on the rock.\" (Matthew 7:24)",
  F:"\"Fan into flame the gift of God.\" (2 Timothy 1:6)",
  A:"\"The wind blows wherever it pleases.\" (John 3:8)"}}
];
window.BQ_ELEMENTS = {
 W:{name:"Water",cls:"w",color:"#2f80c9",tag:"The Healer & Encourager",
  desc:"You're the friend who feels deeply and flows around any obstacle. People open up to you because you listen first and love gently. In your church family, you're the one who notices the quiet person in the corner, checks in when someone drops off, and makes every room feel safe. Your superpower is compassion.",
  verse:"\"Whoever drinks the water I give them will never thirst.\" (John 4:14)"},
 E:{name:"Earth",cls:"e",color:"#4f8a3a",tag:"The Rock & Builder",
  desc:"You're steady, loyal, and the definition of dependable. When something needs doing, you're already doing it. You set up the chairs, remember the details, and show up every single week. People lean on you because you don't move when life gets shaky. Your superpower is faithfulness.",
  verse:"\"Everyone who hears these words of mine and puts them into practice is like a wise man who built his house on the rock.\" (Matthew 7:24)"},
 F:{name:"Fire",cls:"f",color:"#d9482b",tag:"The Spark & Leader",
  desc:"You bring the passion, the boldness, and the energy. You're first to pray out loud, first to say yes to the mission, and first to speak life over a friend who needs it. You light up a worship night and stir up everyone around you. Your superpower is zeal.",
  verse:"\"Fan into flame the gift of God, which is in you.\" (2 Timothy 1:6)"},
 A:{name:"Air",cls:"a",color:"#e6a419",tag:"The Free Spirit & Peacemaker",
  desc:"You're joyful, creative, and full of peace. You bring the laughter, the fresh ideas, and the spontaneous adventures that turn acquaintances into family. You keep things light without missing what matters, and you help people breathe again. Your superpower is joy.",
  verse:"\"The wind blows wherever it pleases… So it is with everyone born of the Spirit.\" (John 3:8)"}
};
window.BQ_ICONS = {
 W:'<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M3 12c3-3 6-3 9 0s6 3 9 0 6-3 8-1"/><path d="M3 19c3-3 6-3 9 0s6 3 9 0 6-3 8-1"/><path d="M3 26c3-3 6-3 9 0s6 3 9 0 6-3 8-1"/></svg>',
 E:'<svg viewBox="0 0 32 32" fill="currentColor"><path d="M2 27 12 9l5 8 3-4 10 14z"/></svg>',
 F:'<svg viewBox="0 0 32 32" fill="currentColor"><path d="M16 2c1 6 8 9 8 17a8 8 0 0 1-16 0c0-4 2-6 4-8 0 3 1 5 3 5-1-5 0-10 1-14z"/></svg>',
 A:'<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M16 16a3 3 0 1 1 3 3c-5 0-8-4-8-8a8 8 0 0 1 16 0"/><path d="M3 22h14a4 4 0 1 1-4 4"/><path d="M3 8h6"/></svg>'
};
window.BQ_ORDER = ["W","E","F","A"];
// Highest total wins. Ties: the tied element picked on the last question (the verse) wins;
// otherwise the tied element picked most recently. Second place shown as a "side".
window.BQ_SCORE = function(picks){
 var s={W:0,E:0,F:0,A:0}; picks.forEach(function(p){ if(s[p]!==undefined) s[p]++; });
 var max=Math.max(s.W,s.E,s.F,s.A);
 var tied=window.BQ_ORDER.filter(function(k){return s[k]===max;});
 var win=tied[0];
 if(tied.length>1){ for(var i=picks.length-1;i>=0;i--){ if(tied.indexOf(picks[i])>=0){win=picks[i];break;} } }
 var rest=window.BQ_ORDER.filter(function(k){return k!==win;}).sort(function(a,b){return s[b]-s[a];});
 return {element:win, scores:s, tie:tied.length>1, side:s[rest[0]]>0?rest[0]:null};
};
