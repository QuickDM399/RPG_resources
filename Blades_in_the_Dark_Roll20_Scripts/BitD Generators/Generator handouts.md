# Generator handouts: a snapshot of the game's "Generators" folder

Read on 2026-10-05 from the Notes field of five handouts in the Roll20 game "Blades in the Dark" (game 22049328), journal folder "Blades in the Dark" > "Generators". The handout HTML was converted to Markdown by a script. Every word of every handout was checked to be present in the Markdown (word counts match the HTML exactly). Nothing was added, corrected, reordered or merged. The typos, odd spacing and ambiguities listed below are in the handouts themselves, not introduced by the conversion.

This file is the ground truth for the generator script: tests should compare the script's data against the tables and lists here, cell by cell. Do not fill any gap from general knowledge of Blades in the Dark; ask the user.

## The handouts

| Handout | Roll20 id | Notes size in the game (URL-encoded) | Markdown block below (characters, checksum) |
|---|---|---|---|
| People | `-MFI8MiEfopVZOz3z0y4` | 31,134 | 7961, -424111957 |
| Devils | `-MFI9Gif49E7DotD7clD` | 22,840 | 7570, 1205235654 |
| Streets & Buildings | `-MFI9NH5YeK-MC2d0GWs` | 26,008 | 6951, 1037768505 |
| Scores | `-MFI9ZeOsdODLqXBswIM` | 6,858 | 3540, -2045712683 |
| Rumors | `-MFI9evCsoRVTXUO4e-d` | 11,145 | 4841, 469780444 |

Checksum: for the text between a `<!-- BEGIN HANDOUT x -->` line and its `<!-- END HANDOUT x -->` line (the text after the BEGIN line's newline, up to the END marker), `h = 0; for each UTF-16 code unit c: h = ((h << 5) - h + c) | 0`.

## How the Markdown maps to the handouts

- Each handout sits between `<!-- BEGIN HANDOUT name -->` and `<!-- END HANDOUT name -->`. Heading levels inside are shifted down by one (a handout h3 appears as `####`). Some section titles are plain paragraphs in the handout and so appear as plain lines ("Preferred Methods", "Professions: Common", "Names").
- **Tables:** a line `*Table N: R rows x C columns, ...*` precedes each table. If the handout table has a header row it is the first row; if not (no `thead` in the handout) the line says "NO header row" and the Markdown header row is empty: every row below it is data. Row labels are the first column. Rows that have a different number of cells from the first row are listed in a `*Note:*` line; empty cells that were only added to make the Markdown rectangular are not in the handout.
- **Lists:** a bullet list (`- `) was a bullet list in the handout; a numbered list (`1.`, `2.`) was a numbered list, whose items are the d6 results 1 to 6 in order. In Scores the number is part of the text ("1 Academic or Scholar").
- `---` is a horizontal rule in the handout. In Scores it separates the three Twist lists; in Rumors it separates one overheard exchange from the next.
- `*italic*` and `**bold**` are the handout's own formatting (the overheard quotes and the rule notes are italic).

## Quirks and ambiguities in the handouts (for the user to decide, not for the script to guess)

1. **People > Style:** the clothing items are separated only by spaces ("Tricorn Hat Long Coat Hood & Veil Short Cloak ..."), so where one item ends and the next begins is not recorded (is it "Tricorn Hat" or "Tricorn" and "Hat"?).
2. **People > Names:** three paragraphs with no labels. The handout does not say what they are (they look like first names, family names and street names; ask). The paragraphs contain what look like typos ("Booker. Ankhayat" with a period, "Da lmore" with a space). Some names appear in more than one paragraph (Bricks, Cross, Ring, Helles). Do not clean or de-duplicate unless the user says so.
3. **People > Looks and Heritage:** a gender list that ends "6: Roll Again", then a 6x6 grid; Heritage is a 1-3 / 4-6 list with a nested Foreigners list; the italic note says each Tycherosi has a demonic trait (that is the link to the Devils handout).
4. **Row labels come in several formats:** "1-3", "4,5", "6" (Ghostly Secondary Effects, Streets Use and Type), "1, 2" with a space (People Goals and Preferred Methods), "1,2" (Demon Desires), and d66 labels "1 1" (People) and "11" (Devils gods, Scores factions). The first digit of a d66 label is the first die.
5. **Devils > Ghost Traits:** the italic line reads "Row: Roll 1d per year of ghostly existence, take highest". Read literally, the row die is the highest of N d6 and the column die is a single d6; confirm with the user.
6. **Devils > Demon Types:** the "Aspect" row has the same text, "Humanoid with bestial or Elemental Features", in columns 1, 2 and 3 (three cells in the handout). Affinity and Aspect look like two independent rolls.
7. **Devils > Demon Features:** one paragraph of comma-separated items where commas are ambiguous: doubled commas appear inside items ("Scales (onyx,, iridescent,, crystalline,, metallic, etc.)") and some items contain a single comma ("Glowing eyes or, markings"; "Lights dim or, flare"). Where the items split is not recorded.
8. **Devils > Forgotten Gods and Cult Practices:** a headerless 36-row table (label, god, practice). The tens digit groups the practices (11-16 Sacrifice, 21-26 Congregation, 31-36 Acquisition, 41-46 Destruction, 51-56 Consecration, 61-66 Desecration). The italic note says "Mix and match gods and practices as you see fit". Typos in the source: "Thew Cloud of Woe", "annointed", "acoylyte".
9. **Streets & Buildings > Streets:** "Mood" is a headerless 6x2 table (label, text; each text has an "or" inside it, for example "Dark or Cold"). "Impressions" has columns Sights, Sounds, Smells. "Use" and "Type" use the 1-3 / 4,5 / 6 rows. "Props" is nine separate numbered 6-item lists with no title saying how to choose one list (ask). Details row 2 has "Stairs, Ramps. Terraces" (a period where a comma probably belongs).
10. **Streets & Buildings > Buildings:** "Exterior" has two rows, Material and Details (two independent rolls); "Items" is five numbered lists, the last with only 4 items (items 5 and 6 are missing in the handout). The italic notes say some buildings have multiple exterior elements and uses.
11. **Scores:** the handout does not say how to choose between the four Client / Target lists (Civilian, Criminal, Political, Strange), the four Work lists, or the three Twist lists (ask the user whether to roll a die, pick, or roll on all). "Ghost of (roll again)" refers back to the same generator. "Connected to A Person..." has (PC), (Crew), (City) and (Weird) prefixes and a rule paragraph about scores outside the crew's hunting grounds (at least two factions, one hurt and one helped). Factions is a 36-item list labelled 11 to 66 with the note "(Roll 2d6)".
12. **Rumors:** "Overheard in Duskwall" is a set of italic quoted exchanges separated by `---`; each exchange is one or more lines and should be treated as one unit. "Rumors on The Street" and "Remarkable Occurrences" are headerless tables whose rows read: label, option A, "OR", option B (the handout does not say whether OR means pick one or roll one). In "Rumors on The Street" row 4 has 6 cells (label, option A, OR, an empty cell, option B, an empty cell). "City Events in The Newspapers" is a normal 6x6 grid. All three Rumors sections say "Weekly, or whenever you need one".
13. Straight and curly apostrophes are mixed in the source ("There’s", "crew's"). "Ecstacy" is spelled that way in both People and Rumors.

---

<!-- BEGIN HANDOUT People -->
#### Looks

- 1, 2: Man
- 3, 4: Woman
- 5: Ambiguous, Concealed
- 6: Roll Again

*Table 1: 7 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Large | Lovely | Weathered | Chiseled | Handsome | Athletic |
| 2 | Slim | Dark | Fair | Stout | Delicate | Scarred |
| 3 | Bony | Worn | Rough | Plump | Wiry | Striking |
| 4 | Short | Tall | Sexy | Wild | Elegant | Stooped |
| 5 | Cute | Plain | Old | Young | Stylish | Strange |
| 6 | Disfigured, Maimed | Glasses, Monocle | Prosthetic, Crippled | Long Hair, Beard, Wig | Shorn, Bald | Tattooed |

#### Heritage

- 1-3: Akorosi
- 4-6: Foreigner

##### Foreigners

  - 1,2: Skovlander
  - 3: Iruvian
  - 4: Dagger Islander
  - 5: Severosi
  - 6: Tycherosi

*Remember, each Tycherosi has a demonic trait: cat's eyes, claws, feathers instead of hair, etc.*

#### Style

Tricorn Hat Long Coat Hood & Veil Short Cloak Knit Cap Slim Jacket Hooded Coat Tall Boots Work Boots Mask & Robes Suit & Vest Collared Shirt Suspenders Rough Tunic Skirt & Blouse Wide Belt Fitted Dress Heavy Cloak Thick Greatcoat Soft Boots Loose Silks Sharp Trousers Waxed Coat Long Scarf Leathers Eelskin Bodysuit Hide & Furs Uniform Tatters Fitted Leggings Apron Heavy Gloves Face Mask Tool Belt Crutches Cane Wheelchair

#### Goals

*Table 2: 4 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1, 2 | Wealth | Power | Authority | Prestige, Fame | Control | Knowledge |
| 3, 4 | Pleasure | Revenge | Freedom | Achievement | Happiness | Infamy, Fear |
| 5, 6 | Respect | Love | Change | Chaos, Destruction | Justice | Cooperation |

Preferred Methods

*Table 3: 4 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1, 2 | Violence | Threats | Negotiation | Study | Manipulation | Strategy |
| 3, 4 | Theft | Arcane | Commerce | Hard Work | Law, Politics | Sabotage |
| 5, 6 | Subterfuge | Alchemy | Blackmail | Teamwork | Espionage | Chaos |

Professions: Common

*Table 4: 7 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Baker | Barber | Blacksmith | Brewer | Butcher | Carpenter |
| 2 | Cartwright | Chandler | Clerk | Cobbler | Cooper | Cultivator |
| 3 | Driver | Dyer | Embroiderer | Fishmonger | Gondolier | Guard |
| 4 | Leatherworker | Mason | Merchant | Roofer | Ropemaker | Rug Maker |
| 5 | Servant | Shipwright | Criminal | Tailor | Tanner | Tinker |
| 6 | Vendor | Weaver | Woodworker | Goat Herd | Messenger | Sailor |

#### Professions: Rare

*Table 5: 7 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Advocate | Architect | Artist | Author | Bailiff | Apiarist |
| 2 | Banker | Bounty Hunter | Clock Maker | Courtesan | Furrier | Glass Blower |
| 3 | Diplomat | Jailer | Jeweler | Leech | Locksmith | Magistrate |
| 4 | Musician | Physicker | Plumber | Printer | Scholar | Scribe |
| 5 | Sparkwright | Tax Collector | Treasurer | Whisper | Composer | Steward |
| 6 | Captain | Spirit Warden | Journalist | Explorer | Rail Jack | Soldier |

*Table 6: 37 rows x 4 columns, first row is the header*

| Roll 2d6 | Traits | Interests | Quirks |
| --- | --- | --- | --- |
| 1 1 | Charming | Fine whiskey, wine, beer. | Superstitious. Believes in signs, magic numbers. |
| 1 2 | Cold | Fine food, restaurants | Devoted to their family. |
| 1 3 | Cavalier | Fine clothes, jewelry, furs. | Married into important / powerful family. |
| 1 4 | Brash | Fine arts, opera, theater | Holds their position to spy for another faction. |
| 1 5 | Suspicious | Painting, drawing, sculpture | Reclusive. Prefers to interact via messengers. |
| 1 6 | Obsessive | History, legends | Massive debts (to banks / criminals / family) |
| 2 1 | Shrewd | Architecture, furnishings | Blind to flaws in friends, allies, family, etc. |
| 2 2 | Quiet | Poetry, novels, writing | Once hollowed, then restored. Immune to spirits. |
| 2 3 | Moody | Pit-fighting, duels | Has chronic illness which requires frequent care. |
| 2 4 | Fierce | Forgotten Gods | Secretly (openly?) controlled by possessing spirit. |
| 2 5 | Careless | Ecstacy of the Flesh | Serves a demon's agenda (knowingly or not). |
| 2 6 | Secretive | Path of Echoes | Proud of heritage, traditions, native language. |
| 3 1 | Ruthless | Weeping Lady, charity | Concerned with appearances, gossip, peers. |
| 3 2 | Calculating | Antiques, artifacts, curios | Drug/alcohol abuser. Often impaired by their vice. |
| 3 3 | Defiant | Horses, riding | Holds their position due to blackmail. |
| 3 4 | Gracious | Gadgets, new technology | Relies on council to make decisions. |
| 3 5 | Insightful | Weapons collector | Involved with war crimes from the Unity War. |
| 3 6 | Dishonest | Music, instruments, dance | Leads a double life using cover identity. |
| 4 1 | Patient | Hunting, shooting | Black sheep / outcast from family or organization. |
| 4 2 | Vicious | Cooking, gardening | In prison or under noble's house arrest. |
| 4 3 | Sophisticated | Gambling, cards, dice | Well-traveled. Connections outside Doskvol. |
| 4 4 | Paranoid | Natural philosophy | Revolutionary. Plots against the Imperium. |
| 4 5 | Enthusiastic | Drugs, essences, tobacco | Inherited their position. May not deserve or want it. |
| 4 6 | Elitist | Lovers, romance, trysts | Minor celebrity. Popularized in print / song / theater. |
| 5 1 | Savage | Parties, social events | Scandalous reputation (deserved or not) |
| 5 2 | Cooperative | Exploration, adventure | Surrounded by sycophants, supplicants, toadies. |
| 5 3 | Arrogant | Pets (birds, dogs, cats) | Spotless reputation. Highly regarded. |
| 5 4 | Confident | Craft (leatherwork, etc.) | Bigoted against culture / belief / social class. |
| 5 5 | Vain | Ships, boating | Visionary. Holds radical views for future. |
| 5 6 | Daring | Politics, journalism | Cursed, haunted, harassed by spirits or demon. |
| 6 1 | Volatile | Arcane books, rituals | Intense, unreasonable phobia or loathing. |
| 6 2 | Candid | Spectrology, Electroplasm | Extensive education on every scholarly subject. |
| 6 3 | Subtle | Alchemy, medicine | Keeps detailed journals, notes, records, ledgers. |
| 6 4 | Melancholy | Essences, alchemy | Is blindly faithful to an ideal, group, or tradition. |
| 6 5 | Enigmatic | Demon lore, legends | Deeply traditional. Opposed to new ideas, methods. |
| 6 6 | Calm | Pre-cataclysm legends | A fraud. Some important aspect is fabricated. |

Names

Adric, Aldo, Amison, Andrel, Arcy, Arden, Arilyn, Arquo, Arvus, Ashlyn, Branon, Brace, Brance, Brena, Bricks, Candra, Canter, Carissa, Carro, Casslyn, Cavelle, Clave, Corille, Cross, Crowl, Cyrene, Daphnia, Drav, Edlun, Emeline, Grell, Helles, Hix, Holtz, Kamelin, Kelyr, Kobb, Kristov, Laudius, Lauria, Lenia, Lizete, Lorette, Lucella, Lynthia, Mara, Milos, Morlan, Myre, Narcus, Naria, Noggs, Odrienne, Orlan, Phin, Polonia, Quess, Remira, Ring, Roethe, Sesereth, Sethla, Skannon, Stavrul, Stev, Syra, Talitha, Tesslyn, Thena, Timoth, Tocker, Una, Vaurin, Veleris, Veretta, Vestine, Vey, Volette, Vond, Weaver, Wester, Zamira, Zara.

Arran, Athanoch, Basran, Boden, Booker. Ankhayat, Bowman, Breakiron, Brogan, Clelland, Clermont, Coleburn, Comber, Daava, Da lmore, Danfield, Dunvil, Edrad, Farros, Grine, Haig, Helker, Helles, Hellyers, Jayan, Jeduin, Kardera, Karstas, Keel, Kessarin, Kinclaith, Lomond, Maroden, Michter, Morriston, Penderyn, Prichard, Rowan, Salkara, Sevoy, Skelkallan, Slane, Strangford, Strathmill, Templeton, Tyrconnell, Vale, Vedat, Walund

Bell, Birch, Bird, Bliss, Bricks, Bug, Chime, Coil, Cricket, Cross, Crow, Echo, Flint, Frog, Frost, Grip, Hook, Ink, Junker, Mist, Moon, Nail, Needle, Ogre, Pool, Ring, Ruby, Silver, Skinner, Song, Spur, Tackle, Thistle, Thorn, Tick Tock, Trick, Vixen, Whip, Wicker.
<!-- END HANDOUT People -->

<!-- BEGIN HANDOUT Devils -->
## Devils

#### Ghost Traits

*Row: Roll 1d per year of ghostly existence, take highest*

*Table 1: 7 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Jealous | Desperate | Violent | Hysterical | Skittish | Fleeting |
| 2 | Curious | Deceptive | Clever | Probing | Knowledgeable | Charming |
| 3 | Prophetic | Insightful | True | Revelatory | Guiding | Instructive |
| 4 | Reactive | Territorial | Dominant | Insistent | Bold | Demanding |
| 5 | Angry | Volatile | Aggressive | Wild | Savage | Vengeful |
| 6 | Mad | Chaotic | Bizarre | Destructive | Insane | Vile |

#### Ghostly Secondary Effects

*Table 2: 4 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1-3 | Frost, Chill | Cold wind | Faint visions of the local past | Electrical Discharge | Weird shadows | Faint echoes |
| 4,5 | Mist, Fog | Rushing wind | Intense visual echoes | Intense magnetism | Disturbing shadows | Thunderous sounds |
| 6 | Freezing Fog | Storm winds | Pitch darkness | Lightning | Clutching shadows | Voices in your head. |

#### Demon Types

*Table 3: 3 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| Affinity | Sea, Water | Darkness | Earth, Metal | Fire, Smoke | Sky, Stars | Storm, Wind |
| Aspect | Humanoid with bestial or Elemental Features | Humanoid with bestial or Elemental Features | Humanoid with bestial or Elemental Features | Animal | Monstrous | Amorphous |

#### Demon Desires

(*Some demons have more than one desire*)

*Table 4: 4 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1,2 | Mayhem | Murder | Justice | Corruption | Power | Control |
| 3,4 | Knowledge | Pleasure | Suffering | War | Revenge | Chaos |
| 5,6 | Freedom | Savagery | Manipulation | Deception | Fear | Achievement |

#### Summoned Horrors

*Table 5: 7 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Reeking Tar | Writhing Mass | Radiant Being | Crystalline Shards | Creeping Growth | Animated Stone |
| 2 | Cloud of Burning Ash | Shadow Being | Swarm of Insects | Toxic Cloud | Fiery Being | Liquid Being |
| 3 | Flayed Being | Shambling Rags | Freezing Fire | Impossible Geometry | Monstrous Animal | Shimmering Spheres |
| 4 | Twisting Machinery | Psychic Mist | Throbbing Viscera | Metallic Being | Coil of Thorns | Hypnotic Lights |
| 5 | Oozing Slug | Tremulous Vibrations | Lashing Hooks | Skeleton of Black Glass | Flowering Quicksilver | Clutching Darkness |
| 6 | Floating Octopoid | Cloying Vapors | Swirling Mucosa | Serpent Being | Insectoid Being | Consuming Orb |

#### Demon Names

Korvaeth, Sevraxis, Argaz, Zalvroxos, Kethtera, Arkeveron, Ixis, Kyronax, Voldranai, Esketra, Ardranax, Kylastra, Oryxus, Ahazu, Tyraxis, Azarax, Vaskari

#### Demon Features

Black shark eyes, Scales (onyx,, iridescent,, crystalline,, metallic, etc.), Razor-sharp claws, Bony protrusions, Multiple eyes, Lashing tail, Leathery wings, Spines, Dripping ichor, Glowing eyes or, markings, Hair or fur, (drifting as if, underwater,, burning with a, cool fire, etc.), Feathers, Multiple arms, Tentacles, Hard shell,, metallic plates, Lights dim or, flare, Plants wither or, grow wildly, Mechanisms, grind to a stop, Liquid freezes,, boils, turns to, blood or ashes.

#### Forgotten Gods and Cult Practices

(*Mix and match gods and practices as you see fit*)

*Table 6: 36 rows x 3 columns, NO header row in the handout: every row below is data*

|  |  |  |
| --- | --- | --- |
| 11 | The One Within Many | Sacrifice: Fed to specially consecrated beasts / Savaged (eaten?) by frenzied cult mob. |
| 12 | The Silver Fire | Sacrifice: Pitted against an annointed champion in death arena. |
| 13 | The Rapturous Chord | Sacrifice: Ritually bled upon the sacred altar. |
| 14 | The Fallen Star | Sacrifice: Progressively overdosed with mind-expanding drugs. |
| 15 | The Lord of the Depths | Sacrifice: Ritually killed and claimed as annointed spirit-champion. |
| 16 | The Silent Song | Sacrifice: Slain by arcane means (electrocuted, spirit shattered, death-cursed). |
| 21 | The Lady of Thorns | Congregation: An orgy of pleasure (sex, food, dance, music) and/or pain. |
| 22 | Our Blood Spilled in Glory | Congregation: Sacred hymns or prayers for days without ceasing. |
| 23 | The Drowned Saviour | Congregation: Occupying a sacred nexus point during an astrological confluence. |
| 24 | The Empty Vessel | Congregation: A pilgrimage to a sacred place or being in the death lands / at sea. |
| 25 | The Closed Eye | Congregation: A group vision / dream-quest via essences, drugs, or meditation. |
| 26 | The Hand of Sorrow | Congregation: A reenactment / dumb-show of a sacred event. |
| 31 | That Which Hungers | Acquisition: A collection of eyes / hearts / blood from mystics or demons. |
| 32 | The Thousand Faces | Acquisition: The shards of a shattered sacred object (jewel, sword, skull, stone). |
| 33 | The Web of Pain | Acquisition: The original holy writings of the prophet / master / saint. |
| 34 | The Pillars of Night | Acquisition: The severed body parts (heads, hands, tongues) of heretics or apostates. |
| 35 | The Burned King | Acquisition: Properties aligned with sacred geometry or attuned by mystical events. |
| 36 | The Father of the Abyss | Acquisition: The ghosts of prophets / mystics / founders / enemies of the order. |
| 41 | The Forsaken Legion | Destruction: Ritual burning of sacred objects (rune-papers, effigies, flesh, hair). |
| 42 | The Unbroken Sun | Destruction: Ritual eradication of a spirit or demon. |
| 43 | The Revelation | Destruction: The breaking of the seals which keep the god from this world. |
| 44 | The Radiant Word | Destruction: Shattering of ritual objects / altars / temples sacred to an enemy order. |
| 45 | The Shrouded Queen | Destruction: Eradication of weapons / objects / sites / rituals which can harm the god. |
| 46 | The Reconciler | Destruction: Eradication of social / legal / cultural elements which threaten the order. |
| 51 | Thew Cloud of Woe | Consecration: Purification by bathing in sacred fluid (blood, wine, milk, oil, etc.). |
| 52 | The Broken Circle | Consecration: Purification of the gates which give passage to the god into this world. |
| 53 | The Conqueror | Consecration: Baptism / blessing of an acoylyte or object by immersion in spirit well. |
| 54 | She Who Slays in Darkness | Consecration: Purify / bless cult followers with tattoos / scarification / mutilation. |
| 55 | The Dream Beyond Death | Consecration: Creation of blessed idols / artwork / ritual spaces / artifacts. |
| 56 | The Blood Dimmed Tide | Consecration: Wards / runes / spirits bound to shun enemies of the order. |
| 61 | The Guardian of the Gates | Desecration: Debasement or defilement of one sworn to an enemy order. |
| 62 | The Maw of the Void | Desecration: Corruption of place / object / ritual / tradition to appropriate its power. |
| 63 | The Keeper of the Flame | Desecration: Defilement of place / object / ritual to humiliate another order. |
| 64 | The Throne of Judgment | Desecration: Manipulation of authorities / institutions to appropriate their power. |
| 65 | The Lost Crown | Desecration: Corruption of acoylytes to prepare them for transformation. |
| 66 | The Golden Stag | Desecration: Mindless, pointless chaos; sewing the seeds of anarchy. |
<!-- END HANDOUT Devils -->

<!-- BEGIN HANDOUT Streets & Buildings -->
### Streets

#### Mood

*Table 1: 6 rows x 2 columns, NO header row in the handout: every row below is data*

|  |  |
| --- | --- |
| 1 | Dark or Cold |
| 2 | Bright or Lively |
| 3 | Quiet or Refined |
| 4 | Abandoned or Decrepit |
| 5 | Cramped or Noisy |
| 6 | Cozy or Warm |

#### Impressions

*(Typical of Doskvol)*

*Table 2: 7 rows x 4 columns, first row is the header*

|  | Sights | Sounds | Smells |
| --- | --- | --- | --- |
| 1 | Rain Slick, Oil Slick | Machinery, Workers | Cook Fires, Furnaces |
| 2 | Dancing Shadows, Flickering Lights | Fluttering Cloth, Howling Winds | Damp Wood, Decay, Refuse |
| 3 | Mist, Fog, Frost | Laughter, Song, Music | Animals, Hides, Blood |
| 4 | Fleeting Shapes, Echoes in the Ghost Field | Whispers, Echoes, Strange Voices | Chemicals, Distillates, Fumes |
| 5 | Soot, Ash Clouds, Grime | Thunder, Driving Rain | Rain Water, Ocean |
| 6 | Crackling Electricity, Wires, Mechanisms | Bells, Clock Chimes, Harbor Horns | Ozone, Electroplasmic Discharges |

#### Use

*(Many streets have multiple uses)*

*Table 3: 4 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1-3 | Residential | Crafts | Labor | Shops | Trade | Hospitality |
| 4,5 | Law, Govt. | Public Space | Power | Manufacture | Transportation | Leisure |
| 6 | Vice | Entertainment | Storage | Cultivation | Academic | Artists |

#### Type

*Table 4: 4 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1-3 | Narrow Lane | Tight Alley | Twisting Street | Rough Road | Bridge | Waterway |
| 4,5 | Closed Court | Open Plaza | Paved Avenue | Tunnel | Wide Boulevard | Roundabout |
| 6 | Elevated | Flooded | Suspended | Subterranean | Floating | Private, Gated |

#### Details

*Table 5: 7 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Metal Supports | Ironwork Gates, Fences | Belching Chimneys | Metal Grates, Hatches, Doors | Clockwork Mechanisms | Rigging, Cables |
| 2 | Stairs, Ramps. Terraces | Wooden Scaffolds | Skyways | Rooftop Spaces | Rails, Train Cars | Hidden Passages |
| 3 | Banners, Pennants | Festival Decorations | Crowd, Parade, Riot | Street Performers | Makeshift Stalls, Shelters | Crisscrossing Routes |
| 4 | Gang Markings | Patrol Posts | Lookouts | Stocks, Public Punishment | Street Crier, Visionary | News Stand, Public Notices |
| 5 | Stray Animals | Landscaping | Muck & Mire | Construction, Demolition | Foul Runoff, Fumes, Smoke | Orphans, Beggars |
| 6 | Ancient Ruin | Leering Gargoyles | Spirit Chimes, Wards | Eerie Emptiness | Quarantine, Lockdown | Shrine Offerings |

#### Props

1. Nets, Ropes
2. Crates, Boxes
3. Cables, Chains
4. Drain Pipes
5. Water Pump
6. Oil Drums

1. Brick Pile
2. Iron Bars
3. Wooden Boards
4. Cut Stones
5. Loose Rocks
6. Cement Buckets

1. Sewer Grate
2. Rotting Refuse
3. Mud Puddles
4. Discarded Junk
5. Carrion & Crows
6. Sodden Trash

1. Carriages
2. Push Carts
3. Moored Boats
4. Cargo Barge
5. Gondolas
6. Wagons

1. Crane & Pulleys
2. Cargo Bales
3. Metal Ingots
4. Industrial Forge
5. Coal / Fuel
6. Waste Bins

1. Street Lamps
2. Electric Wires
3. Junction Boxes
4. Spotlight Tower
5. Clock Tower
6. Messenger Post

1. Withered Trees
2. Monument
3. Fountain
4. Mossy Ruin
5. Collapsed Bldg.
6. Flimsy Hovel

1. Barricade
2. Gate
3. Checkpoint
4. Piled Rubble
5. Canal Lock
6. Lightning Barrier

1. Food Stall
2. Vendor Stall
3. Barrels, Casks
4. Makeshift Shrine
5. News Stand
6. Stockade

### Buildings

#### Exterior

*Some buildings have multiple exterior elements*

*Table 6: 3 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| Material | Gray Brick | Stone & Timbers | Cut Stone Blocks | Wooden Boards | Plaster Board & Timbers | Metal Sheeting |
| Details | Tile Work | Iron Work | Glass Work | Stone Work | Wood Work | Landscaping |

#### Use: Common

*Many buildings have multiple uses*

*Table 7: 7 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Bunk House | Inn | Tavern | Gambling Hall | Drug Den | Brothel |
| 2 | Market | Workshop | Bakery | Butchery | Forge | Tailory |
| 3 | Work House | Goat Stables | Brewery | Watch Post | Court, Jail | Dock |
| 4 | Ruin | Row Houses | Tenements | Apt. Building | Small House | Bath House |
| 5 | Shrine | Tattooist | Physicker | Fighting Pits | Square, Fountain | Grotto |
| 6 | Warehouse | Stockyard | Factory | Refinery | Eelery | Mushroom Garden |

#### Use: Rare

*Many buildings have multiple uses*

*Table 8: 7 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Market House | Restaurant | Bar, Lounge | Academy | Salon | Cafe |
| 2 | Floristry | Tobacconist | Book Shop | Jeweler | Clothier | Gallery |
| 3 | Apothecary | Horse Stables | Distillery | Vintner | Master Artisan | Boat House |
| 4 | Theater | Opera House | Apt. Building | Townhouse | Manor House | Villa |
| 5 | Clinic | Temple | Cistern | Watch Post | Park | Monument |
| 6 | Archive | Spiritualist | Bank | Alchemist | Power Plant | Radiant Energy Garden |

#### Details

*Table 9: 7 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Dripping Water | Creaking Floorboards | Roaring Fires | Smoky Lamps | Buzzing Electric Lights | Ticking Clockworks |
| 2 | Plants, Flowers | Wall Hangings, Artwork | Shuttered Windows | Heavy Curtains, Thick Carpet | Dust & Detritus | Wear & Damage |
| 3 | Threadbare & Tattered | Utilitarian Furnishings | Elegant Finery | Lush & Comfortable | Rough-Spun Simplicity | Spartan Austerity |
| 4 | Circular Stairs, Ladders | Secret Doors | Catwalks | Skylights | Balcony | Cellar |
| 5 | Drafty, Cold | Stout, Quiet | Cozy, Warm | Vaulted, Spacious | Low, Cramped | Rickety, Ramshackle |
| 6 | Strange Devices | Weird Artifacts | Spirit Wards, Old Runes | Piled Jumble of Curios | Antique Appointments | Shrine, Altar |

#### Items

1. Chalkboard, Desks, Papers
2. Maps, Charts, Diagrams
3. Books, Scrolls, Bookcases
4. Lamp, Inkwell, Writing Desk
5. Clock, Cabinet, Shelves
6. Table, Chairs, Notebooks

1. Bed, Bureau, Vanity
2. Bunks, Stools, Trunks
3. Basin, Pitcher, Mirror
4. Sofa, Divan, Music Box
5. Couches, Table, Lamps
6. Drapery, Pillows, Cushions

1. Counter, Sink, Cabinets
2. Cookfire, Pots, Pans, Utensils
3. Dining Table, Chairs, Cutlery
4. Game Board, Cards, Dice
5. Larder, Spices, Meat Hooks
6. Wine, Beer, Whiskey

1. Pedestal, Statue, Paintings
2. Bird Cage, Quill, Diary
3. Bell, Book, Candle
4. Fireplace, Rug, Armchair
5. Curtains, Vases, Flowers
6. Instruments, Music Sheets

1. Exam Chair, Medical Tools
2. Burner, Vials, Beakers
3. Workbench, Tools, Rags
4. Weapons, Ammunition
<!-- END HANDOUT Streets & Buildings -->

<!-- BEGIN HANDOUT Scores -->
## Scores

### Client / Target

#### Civilian

- 1 Academic or Scholar
- 2 Laborer or Tradesman
- 3 Courier or Sailor
- 4 Merchant or Shopkeeper
- 5 Artist or Writer
- 6 Doctor or Alchemist

#### Criminal

- 1 Drug Dealer or Supplier
- 2 Mercenary or Thug
- 3 Fence or Gambler
- 4 Spy or Informant
- 5 Smuggler or Thief
- 6 Crime Boss

#### Political

- 1 Noble or Official
- 2 Banker or Captain
- 3 Revolutionary or Refugee
- 4 Clergy or Cultist
- 5 Constable or Inspector
- 6 Magistrate or Ward Boss

#### Strange

- 1 Ghost of (roll again)
- 2 Occult Collector
- 3 Vampire or Other Undead
- 4 Demon (disguised)
- 5 Possessed or Hollow
- 6 Whisper or Cultist

### Work

#### Skullduggery

- 1 Stalking or Surveillance
- 2 Sabotage or Arson
- 3 Lift or Plant
- 4 Poison or Arrange Accident
- 5 Burglary or Heist
- 6 Impersonate or Misdirect

#### Violence

- 1 Assassinate
- 2 Disappear or Ransom
- 3 Terrorize or Extort
- 4 Destroy or Deface
- 5 Raid or Defend
- 6 Rob or Strong-arm

#### Underworld

- 1 Escort or Security
- 2 Smuggle or Courier
- 3 Blackmail or Discredit
- 4 Con or Espionage
- 5 Locate or Hide
- 6 Negotiate or Threaten

#### Unnatural

- 1 Curse or Sanctify
- 2 Banish or Summon
- 3 Extract Essence
- 4 Place or Remove Runes
- 5 Perform / Stop Ritual
- 6 Hollow or Revivify

### Twist or Complication

- 1 An element is a cover for heretic spirit cult practices.
- 2 An occultist has foreseen this job and warned the parties involved
- 3 Rogue spirits possess some/most/all of the people involved
- 4 Rogue spirits haunt the location
- 5 The job furthers a demon’s secret agenda
- 6 The job furthers a vampire’s secret agenda

---

- 1 An element is a front for a criminal enterprise
- 2 A dangerous gang uses the location
- 3 The job is a trap laid by your enemies
- 4 The job is a test for another job
- 5 The job furthers a merchant lord’s secret agenda
- 6 The job furthers a crime boss’s secret agenda

---

- 1 Job requires travel by electro-rail
- 2 Must visit the death-lands to do the job (perhaps to the Lost District, outside the lightning barrier)
- 3 Job requires sea travel
- 4 The location moves around (site changes, it's on a vehicle, etc.)
- 5 The job furthers a revolutionary’s secret agenda
- 6 The job furthers a city official’s secret agenda

### Connected to A Person...

- 1 (PC) Friend
- 2 (PC) Rival
- 3 (PC) Vice purveyor
- 4 (Crew) Contact
- 5 (City) Doskvol notable
- 6 (Weird) Ghost, Demon, Forgotten God

*When a score is generated outside the crew's hunting grounds (or from their products, artifacts, or other resource) it's usually connected to at least two factions: one that the score hurts in some way, and another faction which is helped by the score in some way*.

### ... and Factions

*(Roll 2d6)*

- 11 The Unseen
- 12 Lord Scurlock
- 13 The Circle of Flame
- 14 The Lampblacks
- 15 The Dimmer Sisters
- 16 The Billhooks
- 21 The Gray Cloaks
- 22 The Fog Hounds
- 23 Council or Foundation
- 24 Spirit Wardens
- 25 Imperial Military
- 26 Sparkwrights
- 31 A Consulate
- 32 Leviathan Hunters
- 33 Gondoliers or Cabbies
- 34 Ecstasy of the Flesh
- 35 Forgotten Gods
- 36 Skovlander Refugees
- 41 The Silver Nails
- 42 The Hive
- 43 The Crows
- 44 The Red Sashes
- 45 The Grinders
- 46 The Wraiths
- 51 Ulf Ironborn
- 52 The Lost
- 53 Ironhook Prison
- 54 Bluecoats / Inspectors
- 55 Ink Rakes
- 56 Cyphers
- 61 Ministry (Transport, Provisions)
- 62 Sailors or Dockers
- 63 Rail Jacks or Brigade
- 64 The Weeping Lady
- 65 Path of Echoes or Reconciled
- 66 Deathlands Scavengers
<!-- END HANDOUT Scores -->

<!-- BEGIN HANDOUT Rumors -->
## Overheard in Duskwall

*"Lyssa did it with her own hands, they say. Eye to eye, cold as can be."*

*"If she stuck her own boss she's a dirty scuttler," (spits)"... but not one I'll cross any time soon."*

---

*"I heard that new Inspector used to be a captain in the Imperial Cavalry..."*

*"I guess snoopin' crooks in the Dusk beats riding down devils in the deathlands, eh?"*

---

*"Red milk, I call it. Y'take scarlet toad venom, distill it pure—a method whispered to me by a demon, hahaha!—cut it with a vesch of fractionated spirit essence, the best memories of former life— dam't hard to get—but if y'got some, even a dram..."*

*"Yes, yes... as I said, Lord Scurlock has..."*

*"Highest high silver can buy—lord, lad, or lady."*

---

*"Ya see, there are two types in this world. Me, an' doffing idiots. That's why I bet on Marlane."*

---

*"You punched a guy out of his pants!"*

*"They were kinda loose, I guess. Boots came off, too. Then his pregnant wife came at me. What are you supposed to do about that?"*

---

*"There goes another crow. How dreadful!"*

*"Whassat? Seven inna last half hour? Naw, mate, this is Crow's Foot. Like, where they perch, get it? Night's just getting started."*

---

*"... seen her in the mirror."*

*"Like, behind him?"*

*"No, just her reflection, in the mirror."*

*"Inky hell."*

---

*"Looks like a regular tattoo to me."*

*"Naaaaw, see how the crab's claw wriggles? Ink's laced with demon blood."*

*"Sure, and I'm the weepin' lady."*

*"Oh, you'll see. Once it sets in..."*

---

#### Rumors on The Street

*Weekly, or whenever you need one.*

*Table 1: 6 rows x 6 columns, NO header row in the handout: every row below is data*

|  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- |
| 1 | Someone is trying to organize a union for Canal Dockers. | OR | The ministry of transport is taking control of the gondoliers. |  |  |
| 2 | The Path of Echoes will buy inhabited spirit bottles, no questions asked. | OR | A leviathan hunter ship returned to port, no crew living, carrying a demon. |  |  |
| 3 | There’s a Bluecoat constable that takes bribes to frame targets for crimes. | OR | A corrupt magistrate is seeking secret passage out of the city ahead of charges. |  |  |
| 4 | The streetwalkers and pleasure houses are infiltrated by rogue spirits. | OR |  | The Church of the Ecstacy of the Flesh is seeking a new Apex. |  |
| 5 | The new drug, Lure, is made from leviathan blood and turns people into demons. | OR | The Spirit Wardens are stockpiling electroplasm, expecting a shortage soon. |  |  |
| 6 | All the well-to-dos are buying Turner's new locks—said to be impossible to crack. | OR | The vault at Charterhall Bank was ransacked, but they're covering it up. |  |  |

*Note: the first row has 4 cells but row 4 (label 4) has 6 cells in the handout; cells padded with empty cells here are not in the handout.*

#### City Events in The Newspapers

*Weekly, or whenever you need one*

*Table 2: 7 rows x 7 columns, first row is the header*

|  | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Plague | Festival | Raids | Revolution | Accident | Disaster |
| 2 | Refugees | Strike | Prohibition | Construction | Siege | Charity |
| 3 | Demolition | Election | Scandal | Martial Law | Conscription | Exodus |
| 4 | Shortage | Excess | Discovery | Paranoia | Assassination | Witch Hunt |
| 5 | Parade | Celebrity | Holiday | Riots | Gang War | Hysteria |
| 6 | Crime Spree | Political Upheaval | Prison Break | Diplomacy | Supernatural Weather | Cult Gatherings |

#### Remarkable Occurrences

*Weekly, or whenever you need one*

*Table 3: 6 rows x 4 columns, NO header row in the handout: every row below is data*

|  |  |  |  |
| --- | --- | --- | --- |
| 1 | Strange plasmic fog fills the streets— deathseeker crows shun the district. | OR | Spirit wardens set up a watch post and deathseeker crow roost in the old temple ruins. |
| 2 | Bluecoats suspend street patrols, citing 'budget cuts'. It's free rein for crime! | OR | Bluecoats set up checkpoints for contraband or whatever they feel like confiscating. |
| 3 | Citizens rally against extortion, bringing in hired bravos from other districts. | OR | Local talent (band, chef, tumblers) becomes popular, swelling crowds at market and shops. |
| 4 | Canals become choked w/ debris, overflowing with foul effluvia. | OR | Canals throughout district are drained for maintenance (or some strange purpose). |
| 5 | The ramshackle shanties of The Drop are marked for demolition. | OR | A raging fire sweeps across Crow's Foot, threatening to destroy the district. |
| 6 | A group of scoundrels, recently escaped from Ironhook, go to ground nearby, attracting bounty hunters. | OR | An ancient crypt beneath the district, covered in strange markings, is exposed and attracts wailing hollows. |
<!-- END HANDOUT Rumors -->
