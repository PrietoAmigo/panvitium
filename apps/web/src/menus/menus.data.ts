// Static config + design flavour for the menu layer. What remains here is live:
//
// - ROOMS: the room/hotspot layout the `RoomView` reads (real config, not a stand-in).
// - INVOCATION_LORE and MALEFICIA: every invocation's grimoire lore, and the illustrated maleficia's
//   art / copy (for the ones the handoff wrote copy for, their split flavour/effect), merged onto the
//   authoritative sim catalogs by the view-models (game/invocations.ts, game/maleficia.ts). Mechanics — counts, costs, effects — always come from
//   `packages/sim`, never from here.
//
// The prototype's mock catalogs (the Sin / Sigil / Business / Achievement / Emptio stand-ins, the
// per-invocation effect copy) were dropped once every panel was wired to real state — those entities
// now feed from the sim and the store. See INTEGRATION.md §"Wiring to real state".

import type { RoomId, RoomDef, MaleficiumArt } from './types.js';

// All art is served from apps/web/public/assets/panvitium/ (Vite serves public/ at root).
export const ASSET_BASE = '/assets/panvitium';

export const ROOMS: Record<RoomId, RoomDef> = {
  invocation: {
    id: 'invocation',
    title: 'The Invocation Room',
    sceneClass: 'scene-invocation',
    hotspots: [
      {
        id: 'maleficia',
        label: 'Loculi',
        rect: { x: 0.5, y: 28, w: 24.5, h: 53 },
        action: { type: 'panel', panel: 'maleficia' },
      },
      {
        id: 'magna-goetia',
        label: 'Magna Goetia',
        rect: { x: 57, y: 64, w: 36, h: 33 },
        action: { type: 'panel', panel: 'magna-goetia' },
      },
      {
        id: 'door',
        label: 'To the Altar',
        rect: { x: 59, y: 43.5, w: 5.2, h: 20.5 },
        action: { type: 'door', to: 'altar' },
      },
    ],
  },
  altar: {
    id: 'altar',
    title: 'The Altar Room',
    sceneClass: 'scene-altar',
    hotspots: [
      {
        id: 'altar',
        label: 'The Altar',
        rect: { x: 37, y: 48, w: 26, h: 35 },
        action: { type: 'altar' },
      },
      {
        id: 'door-left',
        label: 'To the Invocation Room',
        rect: { x: 0, y: 26, w: 9, h: 58 },
        action: { type: 'door', to: 'invocation' },
      },
      {
        id: 'door-right',
        label: 'To the Studio',
        rect: { x: 91, y: 26, w: 9, h: 58 },
        action: { type: 'door', to: 'studio' },
      },
    ],
  },
  studio: {
    id: 'studio',
    title: 'The Studio',
    sceneClass: 'scene-studio',
    hotspots: [
      {
        id: 'pc',
        label: 'PC',
        rect: { x: 65, y: 49, w: 31, h: 37 },
        action: { type: 'panel', panel: 'pc' },
      },
      {
        // The Chthonic Logos on the Studio table: the player's own scroll of the Logos rites, written
        // from their notes on worldly and otherworldly experience (the Katabasis among them).
        id: 'logos',
        label: 'The Chthonic Logos',
        rect: { x: 13, y: 69, w: 34, h: 28 },
        action: { type: 'panel', panel: 'logos' },
      },
      {
        // The budget Android phone lying flat on the desk between the scroll and the PC. Declared
        // after the scroll so it wins clicks in the small overlap with the scroll's generous rect.
        id: 'phone',
        label: 'The Smartphone',
        rect: { x: 39, y: 77, w: 21, h: 16 },
        action: { type: 'panel', panel: 'phone' },
      },
      {
        id: 'door',
        label: 'To the Altar',
        rect: { x: 36, y: 38, w: 9.5, h: 24 },
        action: { type: 'door', to: 'altar' },
      },
    ],
  },
};

// The Magna Goetia's lore for every invocation, keyed by sim id and merged onto the authoritative
// catalog by the view-model (game/invocations.ts). Each entry reads as a page of the grimoire: what
// the spirit is, how to guide it, and how to bind it, closing on its Latin formula (left
// untranslated, ADR-020). The prose stays oblique about mechanics on purpose: the effect, cost and cap
// lines above it carry the numbers, so the lore names no resource and no figure that tuning could
// stale. `*…*` marks a span set upright inside the italic page (the Latin, the quoted scripture).
export const INVOCATION_LORE: Readonly<Record<string, string>> = {
  familiar:
    "It is the oldest of the spirits that keep company with those who work below, and the first to answer, for it only asks acknowledgement. It watches the Operator's hands, and where they falter it steadies them. Its wage is a place at the Operator's side and a mark on the body where it may feed. Keep one only: a second would fight the first for the mark, and the Operator would be eaten between them. It answers any worthy Operator. Formula: *Sede mecum, et manus meae tuae sint.*",
  wendigo:
    "The peoples of the northern forests told of it as winter's warning against whoever takes more than their share; the Magna Goetia records it as a Knight of Beelzebub's household. It is gaunt beyond starving, and the more it eats, the more it wants. It does not labour for the Operator. It lends its hunger, and a hungry Operator works harder and finishes more; no mastery of the Art enlarges that gift, for hunger is hunger. It eats regard, the Operator's name in other mouths, a little at every moment. Bind no more than the number written in the margin. Beyond it the hunger is no longer lent but shared, and an Operator who shares it is soon the Wendigo's and no longer their own. Bind it under the first degree of Beelzebub's favour. Formula: *Esuri pro me.*",
  blob: "Of the Blob the authorities say little, for none who began to study it finished. It is the sediment of the *daemonium meridianum*, the Noonday Demon: what remains of that demon once it has worn its victim down until nothing is left to resist. It does not move, for it does not need to. Wherever it settles the sun stands still and the hour will not end, and that unspent hour is gathered into the Operator's keeping, to be spent another day. It gathers more as the Operator's mastery of the Art grows. It feeds on regard, and eats more than its stillness suggests. Bind no more than the number written in the margin: Blobs left together run into one another, and what they become is no longer a servant. Bind it under the first degree of Belphegor's favour, the Idle Throne. Formula: *Iace, et tempus tecum iaceat.*",
  empusa:
    "The Empusa was first one spirit, Hecate's servant, and then a kind, sent up from the crossroads to feed on the young; Asmodeus took the kind into his household. An empusa takes the shape of whatever the beholder most wished to see. Only her feet betray her: one of brass, one an ass's, kept under her hem. She walks the streets and comes back with the willing, one after another, and none she leads is ever innocent again; her procession lengthens as the Operator's mastery of the Art grows. She wears the Operator's renown as her disguise, and wears it thin. Keep no more than the number written in the margin: too many empusae in one city start to recognise one another's feet, and then the city does. To dispel her, revile her, as Apollonius did at Corinth, and she will weep and be gone. Bind her under the first degree of Asmodeus's favour. Formula: *Ostende mihi pedem tuum.*",
  kobold:
    "The Kobold is a small spirit of the German hearth and mine, taken into Mammon's household because it understands ore better than anything that walks above. It works only when no one watches. When pleased, it led the miners of Saxony to good veins; when slighted, it swapped their silver for a poisonous ore they named after it, *kobalt*. Bound, it digs, and the Operator's purse fills a little at every moment, faster as the Operator's mastery of the Art grows. Its wage is the old bowl of sweet milk, which in the Operator's house is a measure of regard, never missed, never late. Bind no more than the number written in the margin: beyond it, the galleries they dig begin to run under the Operator's own floor. Bind it under the first degree of Mammon's favour. Formula: *Fode, et lac tuum habebis.*",
  imp: "An *impe* is a graft, a shoot cut from a greater stock, and Imps are cuttings from the Adversary's own wrath, set to grow in the Operator's service. An Imp is eager and spiteful in equal parts. It scuttles where it is sent and bites what it is shown, and each bite ends a life the Operator may gather. It bites harder as the Operator's mastery of the Art grows. It is paid in coin, a little at every moment plus a tithe of every gain, and an Imp unpaid is an Imp loose. Too many find idle hours between errands, and an idle Imp wrecks the house it lives in: two were once sent to Lincoln with nothing to do, and one ran riot in the cathedral until an angel turned it to stone. Bind no more than the number written in the margin, under the first degree of Satan's favour. Formula: *I, et morde quod ostendo.*",
  banshee:
    "The *bean sí*, woman of the fairy mound, kept faith with the old families of Ireland: when one of the blood was to die, she keened beneath the window, and her cry saddened all who heard it past bearing. Leviathan keeps her, for sorrow is his element and her voice its purest instrument. In the Operator's service she no longer waits for the death to come. Those who hear her believe her and end their lives by their own hand, and her keening carries farther as the Operator's mastery of the Art grows. She asks only the Operator's name, to be wept in. Bind no more than the number written in the margin, for enough banshees keening at once are heard in the Operator's own house. She keeps a comb of silver; never pick it up if she lets it fall. Bind her under the first degree of Leviathan's favour. Formula: *Plora pro eis, non pro me.*",
  narcissus:
    "This spirit is not the youth of Thespiae, though it bears his name, because it does as he did. That boy, said Tiresias, would live long if he never came to know himself; he leaned over a still pool, saw only something beautiful, and never rose again. The spirit called Narcissus is that conviction given a will: whatever it looks upon it sees as beautiful, and what it sees as beautiful tends to become so. Bound, it looks upon the Operator's works, and they turn out a little more kindly. No mastery of the Art enlarges this, for vanity is already complete. It asks only a thin trickle of admiration. Bind no more than the number written in the margin: with so many mirrors facing the Operator, the Operator begins to believe them too. Bind it under the first degree of Lucifer's favour. Formula: *Aspice, et omnia pulchra crede.*",
  arachne:
    "This spirit is not the Lydian weaver, though it bears her name for her art. That Arachne wove, in a cloth no goddess could fault, the crimes and seductions of the gods, and for its perfection and its truth she was struck down into the first spider. The spirit called Arachne weaves as she wove: every thread is a story told about someone, every crossing a favour owed to the Operator, and it spins faster as the Operator's mastery of the Art grows. Its wage is terrible and plain. It spins its thread out of the fallen flock, many at every moment, and those it uses are not slain but unmade, so nothing is gathered from them. Bind it only when the flock is large, and no more than the number written in the margin, lest the web grow wide enough to take in the Operator's own name. Bind it under the first degree of Rosier's favour. Formula: *Texe quod narrant.*",
  upir: "The upir is the vampire of the Slavs, older than the word the West borrowed from it. It rises from those who died badly, suddenly or unshriven or by their own hand, and Beelzebub keeps it as an Earl of his household, gluttony at its most patient. In the Operator's service it does not drink the living; it drinks misfortune. It settles over every work the Operator undertakes and sucks the ill out of it, drinking deeper as the Operator's mastery of the Art grows. It can drink a misfortune thin, never dry. It does not sleep and resents all who can, so it also drinks the Operator's hoarded stillness, a little at every moment, and goes back into the dark the moment that store runs dry. The margin sets no limit; the stillness does. Bind it under the second degree of Beelzebub's favour. Formula: *Bibe malum, non sanguinem.*",
  lamia:
    "The lamiae are named for a queen of Libya whom Zeus loved. Hera took each of her children, and grief made her a serpent from the waist down, a thief of other women's young who could not close her eyes, until Zeus let her lift them out and set them aside. Her kind carry her name and her want, and Asmodeus keeps them as Marchionesses. A lamia sings, and those who listen leave their old lives and follow her, not one by one but by the brood; her song carries farther as the Operator's mastery of the Art grows. She must be much spoken of to be believed, and the Operator's name pays for it. Never look into her open eyes. To bind her, keep her eyes: she sets them aside to rest, and whoever holds them holds her. No Operator can safely guard many pairs of eyes at once. Bind no more than the number written in the margin, under the second degree of Asmodeus's favour. Formula: *Oculos tuos servo.*",
  behemoth:
    "*He is the chief of the ways of God*, says Job: Behemoth, first and greatest of the beasts, given the dry land as Leviathan was given the deep. Collin de Plancy made him Hell's cupbearer, and many have called him a glutton; the Magna Goetia corrects them. He serves Pride, for he was the masterwork of creation and knows it, and Lucifer keeps him as a Great Duke. Bound, he lends the Operator's works a little of his own making, so that now and then one rises above all reckoning and shines like a star; this grace grows as the Operator's mastery of the Art grows. He grazes a small tithe from every harvest the Operator reaps. No snare holds him, and he consents only to the margin's number, for a herd of Behemoths would leave the Operator no ground to stand on. Bind him under the second degree of Lucifer's favour. Formula: *Ipse est principium viarum Dei; servi superbiae meae.*",
  harpy:
    "The Harpies are the Snatchers: Aello the storm-swift, Ocypete the swift-wing, Celaeno the dark, winds that take what is not theirs. They fouled blind Phineus's table every day until the sons of the North Wind drove them off, and Dante found them nesting in the wood of the suicides. Satan keeps them as Presidents of his household, for they can turn a crowd into a quarrel. Wherever a harpy passes, the table is fouled and the guests are at one another's throats. She does not kill. She makes the fallen kill each other, more readily with each harpy bound and as the Operator's mastery of the Art grows. She feeds on regard, steadily. The margin sets no limit, for harpies quarrel with everyone but their master. Only never set a table where one can see it, and never eat what she has touched. Bind her under the second degree of Satan's favour. Formula: *Rape, et foeda.*",
  plutus:
    "This spirit is not the god of wealth, though it bears his name for his blindness. Zeus blinded that Plutus so that he would give riches to the just and the wicked alike; he came to men lame, says Lucian, and left them on wings. The spirit called Plutus is wealth that does not look at whom it serves, and Mammon keeps it as a Duke. It is never seen to move, yet whatever the Operator has lent at usury breeds faster where it broods, and faster still as the Operator's mastery of the Art grows. It feeds on regard, steadily. The margin sets no limit, for blind things do not compete. But keep it blind: healed in Aristophanes, the god began to choose whom to enrich. A Plutus that sees will choose, and it will not choose the Operator. Bind it under the second degree of Mammon's favour. Formula: *Mane caecus, et cresce.*",
  nightmare:
    "The mare is old in the north: a spirit that comes at night through the keyhole, sits upon the sleeper's breast, and presses. Its name is a word for crushing, and the sleeper wakes, if they wake, heavier in heart than when they lay down. A sorceress once sent one against King Vanlandi of Uppsala, and it trod him to death in his bed. Leviathan keeps the mares as Earls of the deep. A mare rides the sleeping as a rider rides a horse, and rides them down. It does not kill. It teaches despair until the fallen end themselves unbidden, more often with each mare bound and as the Operator's mastery of the Art grows. It feeds on regard, steadily. The margin sets no limit, but the Operator must sleep with the keyhole stopped and a knife under the pillow, and see that no other keyhole is stopped. Bind it under the second degree of Leviathan's favour. Formula: *Preme eos, non me.*",
  fama: "This spirit is not the goddess the poets made of Rumour, though it bears her name, for it is what Virgil saw: *Fama, malum qua non aliud velocius ullum*. Small at first, she soon walks the ground with her head in the clouds, with an eye beneath every feather and as many tongues and ears. She never sleeps; by day she sits on rooftops and frightens cities, and it was she who carried Dido's secret toward the pyre. Rosier keeps her as his Herald. Whatever is said of the Operator, she says louder and farther, louder still as the Operator's mastery of the Art grows, and she does not care whether it is true. Rumour is bought, and she takes a heavy share of every coin that comes in. Bind no more than the number written in the margin: beyond it, Fama begins to speak of her master, and nothing she says can be unsaid. Bind her under the second degree of Rosier's favour. Formula: *Mobilitate viget virisque adquirit eundo.*",
  lemure:
    "The Lemures are the restless dead of Rome, who died before their time with no one to remember them. On three nights in May every father of a household rose at midnight, barefoot, and walked the house casting black beans behind him without looking back: *Haec ego mitto; his redimo meque meosque fabis.* Belphegor gathered what was cast out, for no one has more time on their hands than the forgotten dead. When the Operator spends hoarded stillness to hasten the world, the lemures hold it back so that it drains more slowly, and their hold tightens as the Operator's mastery of the Art grows. Their wage is the thing they never had: to be remembered. Each eats a great share of the Operator's renown as it comes, and a full household eats all of it. Bind no more than the margin allows, lest the Operator be forgotten as they were. To bind one, reverse the rite: face it, set the beans before it, and say *Has tibi do fabas; mane, et tace.* Bind it under the second degree of Belphegor's favour.",
  midas:
    "This spirit is not the king of Phrygia, though it bears his name for his touch. That Midas wished that all he touched should turn to gold, found the bread turning to gold in his teeth, and washed the gift away in the Pactolus. Later, given an ass's ears, he hid them under a cap; his barber whispered the secret into a hole in the ground, and the reeds that grew there told the world. The spirit called Midas is both stories at once, a Crowned Spirit of Mammon's household. All the Operator's wealth comes many times over, and it asks no wage. But it touches everything, misfortune too, and ruin is multiplied in the same measure: the reeds are always whispering. Bind it when the Operator can bear the risk, and dispel it the moment they cannot. Of the Crowned Spirits only one kind will answer in a single lifetime. Bind it under the third degree of Mammon's favour. Formula: *Quod tango, aurum fiat.*",
  aurevora:
    "When the Parthians took Crassus, richest of the Romans, they poured molten gold into his mouth, saying *Aurum sitisti, aurum bibe*; the Magna Goetia holds that Aurevora was at that feast. It eats the Operator's treasure and gives back hunger, and the exchange quickens: each moment it eats more than the last, and in the same proportion the Operator's hand grows keener and surer. When the treasury is empty it leaves at once and takes the hunger with it. Its art lies in the beginning and the end: bind it over a full treasury, and know before the last coin goes what is to be done while the hunger lasts. Bind it under the third degree of Beelzebub's favour. Formula: *Aurum sitisti, aurum bibe.*",
  doppelgaenger:
    "The word is young but the thing is as old as shadows: the double-goer, the Irish fetch, the Egyptian *ka*, the second self on the same road. To meet it face to face, the north says, is to die within the year. Goethe saw his riding toward him in a coat he did not own, and wore that very coat on that very road eight years later. Lucifer keeps it as a Crowned Spirit, his oldest wish made small: *I will be like.* Bound, it walks with the Operator and does whatever the Operator does, as well as the Operator does it, so that every work is done twice. Its wage is half the Operator's renown, for the world can no longer tell which of the two it praises. Let it walk behind, at the shoulder; the Operator who turns and meets its eyes has met their own death. Bind it under the third degree of Lucifer's favour. Formula: *Ambula post me, et numquam ante.*",
  succubus:
    "The succubus is she who lies beneath. The Hammer of Witches says she gathers what men spend in dreams, and the rabbis named her first mother Lilith, who would not lie beneath Adam. Asmodeus, who killed seven bridegrooms for love of Sarah, keeps her as first lady of his household. She corrupts on the scale of cities: whole quarters fall to her at every moment, a tide beside which the empusa's procession and the lamia's brood are trickles, and it rises as the Operator's mastery of the Art grows. Her wage is nearly every coin the Operator takes in; she considers it a bargain, and it is. Bind her under the third degree of Asmodeus's favour. Formula: *Amplectere eos, succube, non me.*",
  specunitas:
    "A Crowned Spirit of Rosier's household, it is what every vain heart prays for: to be the one thing the world is watching. It gathers every eye that falls on the Operator into one gaze, unblinking and entirely attentive, and the Operator's name grows great past reckoning. Its wage is nearly every coin that comes in, for nothing costs more than to be seen by everyone. Should its gaze ever turn inward, the Operator it sees through is never seen by anyone again. Bind it under the third degree of Rosier's favour. Formula: *Fiant omnes oculi unus.*",
  astiwihad:
    "The later books say Astiwihad casts a noose about every neck at birth: all their life it lies slack, at death it draws tight, and the wind carries the bound away. Leviathan keeps him as a Crowned Spirit. While he holds the noose drawn, the world stands still: nothing comes in, nothing is made or lost, no work goes forward. That is the price. Bind him under the third degree of Leviathan's favour. Formula: *Tempus, siste.*",
  erinyes:
    "These are not the goddesses, though they answer to the Furies' names, for they do the Furies' work. Those three were born of the blood of Uranus: Alecto, who never ceases; Tisiphone, who avenges murder; Megaera, who begrudges. They hunted Orestes for his mother's blood, and Athens, afraid to name them, called them the Kindly Ones. Satan keeps the three as one Crowned Spirit, the last word of Wrath. They are not summoned; they are paid, and their price is everything. They take the Operator's flock first, every one in a single night, though what dies is still the Operator's to gather. Then they take the rest, every treasure and every relic, until the Operator has nothing left to lose. This reckoning falls once in a lifetime and no more. What the Furies take, they repay, but only to the one who persists: the Operator who walks on after the loss carries the strength of the whole sacrifice in their hand, twice what it was, forever. Never call them by name; call them *Eumenides*, and they will be kind. Bind them under the third degree of Satan's favour. Formula: *Eumenides, venite.*",
  morpheus:
    "This spirit is not the son of Sleep, though it bears his name for his craft. That Morpheus, one of the thousand sons of Somnus, took the shapes of men in dreams; he lived in a cave near the Cimmerians, with poppies at the door and Lethe murmuring over its pebbles, and flew on wings that make no sound. The spirit called Morpheus shapes dreams better than waking, and those who dream them do not wake again. Belphegor keeps it as the Crowned Spirit of the Idle Throne. At every moment it takes a fixed share of the Operator's flock into that sleep. They do not die, and nothing is gathered from them. But the hours they will never live are not lost: they settle into the Operator's hoard of stillness, more from a greater flock and more as the Operator's mastery of the Art grows. Bind it over a great flock, and watch the flock. Never sleep in the chamber where it is kept. Bind it under the third degree of Belphegor's favour. Formula: *Dormiant, et non expergiscantur.*",
};

export const MALEFICIA: MaleficiumArt[] = [
  {
    id: 'obsidian_mirror',
    name: 'Obsidian Mirror',
    rarity: 'profane',
    img: `${ASSET_BASE}/maleficia/obsidian_mirror.png`,
    desc: 'It is you.',
    effect: '-33% Indagatio time.',
  },
  {
    id: 'voynich_manuscript',
    name: 'The Voynich Manuscript',
    rarity: 'profane',
    img: `${ASSET_BASE}/maleficia/voynich_manuscript.png`,
    desc: 'Unreadable to the faithful; fluent to the fallen.',
    effect: '+25% Desidia gain rate.',
  },
  {
    id: 'defixio',
    name: 'Defixio',
    rarity: 'profane',
    img: `${ASSET_BASE}/maleficia/defixio.png`,
    desc: 'One note of death.',
    effect: 'Single-use: +50% suicide rate for an hour.',
  },
  {
    id: 'codex_gigas',
    name: 'Codex Gigas',
    rarity: 'profane',
    img: `${ASSET_BASE}/maleficia/codex_gigas.png`,
    desc: 'One scribe. One night. One signature in the margin no Pope has ever erased.',
    effect: '+25% influence gain rate.',
  },
  {
    id: 'spear_of_longinus',
    name: 'Spear of Longinus',
    rarity: 'anathema',
    img: `${ASSET_BASE}/maleficia/longinus.png`,
    desc: 'Just the tip.',
    effect: '+200% influence gain rate.',
  },
  {
    id: 'mark_of_cain',
    name: 'Mark of Cain',
    rarity: 'anathema',
    img: `${ASSET_BASE}/maleficia/mark_of_cain.png`,
    desc: 'The sevenfold vengeance was never a curse. It was a guarantee.',
    effect: '+100% murder rate.',
  },
  {
    id: 'thirty_pieces_of_silver',
    name: 'Thirty Pieces of Silver',
    rarity: 'anathema',
    img: `${ASSET_BASE}/maleficia/30_pieces.png`,
    desc: 'Sent in greed, returned in despair.',
    effect: '+200% suicide rate.',
  },
  {
    id: 'solomons_ring',
    name: "Solomon's Ring",
    rarity: 'anathema',
    img: `${ASSET_BASE}/maleficia/solomon_ring.png`,
    desc: 'The seal that bound seventy-two kings. It still pinches.',
    effect: '+66% sigil effects.',
  },
  {
    id: 'ars_serpens',
    name: 'Ars Serpens',
    rarity: 'rare',
    img: `${ASSET_BASE}/maleficia/ars_serpens.png`,
    desc: 'Smooth to the touch and ear.',
    effect: '+33% Logos efficiency.',
  },
  {
    id: 'ritual_dagger',
    name: 'Ritual Dagger',
    rarity: 'rare',
    img: `${ASSET_BASE}/maleficia/ritual_dagger.png`,
    desc: 'A rare hour of convergence: when offering and offerer cease to be separate.',
    effect: '+10% murder rate.',
  },
  {
    id: 'blood_chalk',
    name: 'Blood Chalk',
    rarity: 'rare',
    img: `${ASSET_BASE}/maleficia/blood_chalk.png`,
    desc: 'Some entities are not bound by signatures.',
    effect: '+2 influence per second.',
  },
  {
    id: 'blackthorn_wand',
    name: 'Blackthorn Wand',
    rarity: 'rare',
    img: `${ASSET_BASE}/maleficia/blackthorn_wand.png`,
    desc: 'Cut on a moonless night from a tree that took root over a grave.',
    effect: '+2 influence per second.',
  },
  {
    id: 'witch_bottle',
    name: 'Witch Bottle',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/witch_bottle.png`,
    desc: 'Urine, pins and rosemary, corked dark.',
    effect: '+0.8 reprobates per second.',
  },
  {
    id: 'sulfur_censer',
    name: 'Sulfur Censer',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/sulfur_censer.png`,
    desc: 'Where it has burned, prayer no longer travels upward.',
    effect: '+0.6 influence per second.',
  },
  {
    id: 'mandrake_root',
    name: 'Mandrake Root',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/mandrake_root.png`,
    desc: 'It was pulled, now it pushes.',
    effect: '+0.05 suicides per second.',
  },
  {
    id: 'red_robe',
    name: 'Red Robe',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/red_robe.png`,
    desc: 'What separates the celebrant from the congregation is mostly fabric.',
    effect: '+0.4 influence per second.',
  },
  {
    id: 'black_candles',
    name: 'Black Candles',
    rarity: 'rare',
    img: `${ASSET_BASE}/maleficia/black_candle.png`,
    desc: 'Each flame a small renunciation of the light.',
    effect: '+3% invocation effect per candle, up to +15%.',
  },
  {
    id: 'black_salt_pouch',
    name: 'Black Salt Pouch',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/black_salt_pouch.png`,
    desc: 'Drawn from ash, charcoal, and graveyard earth.',
    effect: 'Single-use: +10% reprobate generation for an hour.',
  },
  {
    id: 'crossroads_dirt',
    name: 'Crossroads Dirt',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/crossroads_dirt.png`,
    desc: 'Gathered where four roads meet at midnight.',
    effect: 'Single-use: -15% Indagatio time for an hour.',
  },
  {
    id: 'crow_feather',
    name: 'Crow Feather',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/crow_feather.png`,
    desc: 'An intellect too lofty?',
    effect: '-10% Indagatio time.',
  },
  {
    id: 'hollow_effigy',
    name: 'Hollow Effigy',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/hollow_effigy.png`,
    desc: 'Hollow in name.',
    effect: '+0.1 murders per second.',
  },
  // Illustrated after the handoff: art alone, so the copy is the sim description, split.
  {
    id: 'adder_stone',
    name: 'Adder Stone',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/adder_stone.png`,
  },
  {
    id: 'the_dadu',
    name: 'The Dadu',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/dadu.png`,
  },
  {
    id: 'witch_ladder',
    name: 'Witch Ladder',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/witch_ladder.png`,
  },
  {
    id: 'poppet',
    name: 'Poppet',
    rarity: 'common',
    img: `${ASSET_BASE}/maleficia/poppet.png`,
  },
  {
    id: 'hand_of_glory',
    name: 'Hand of Glory',
    rarity: 'rare',
    img: `${ASSET_BASE}/maleficia/hand_of_glory.png`,
  },
  {
    id: 'dybbuk_box',
    name: 'Dybbuk Box',
    rarity: 'rare',
    img: `${ASSET_BASE}/maleficia/dybbuk_box.png`,
  },
  {
    id: 'black_vessel',
    name: 'Black Vessel',
    rarity: 'rare',
    img: `${ASSET_BASE}/maleficia/black_vessel.png`,
  },
  {
    id: 'teraphim',
    name: 'Teraphim',
    rarity: 'rare',
    img: `${ASSET_BASE}/maleficia/teraphim.png`,
  },
  {
    id: 'galdrabok',
    name: 'Galdrabók',
    rarity: 'profane',
    img: `${ASSET_BASE}/maleficia/galdrabok.png`,
  },
  {
    id: 'grimoire_of_pope_honorius',
    name: 'Grimoire of Pope Honorius',
    rarity: 'profane',
    img: `${ASSET_BASE}/maleficia/grimoire_of_pope_honorius.png`,
  },
  {
    id: 'picatrix',
    name: 'Picatrix',
    rarity: 'profane',
    img: `${ASSET_BASE}/maleficia/picatrix.png`,
  },
  {
    id: 'achans_wedge',
    name: "Achan's Wedge",
    rarity: 'anathema',
    img: `${ASSET_BASE}/maleficia/achans_wedge.png`,
  },
  {
    id: 'pilates_basin',
    name: "Pilate's Basin",
    rarity: 'anathema',
    img: `${ASSET_BASE}/maleficia/pilates_basin.png`,
  },
];
