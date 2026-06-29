# Business model, licence, and market notes

## Positioning

Ludovive should not be positioned as another virtual tabletop or another character sheet manager.

The stronger position is:

- an Android-first engine for social live-action games;
- a rules-and-state assistant for game masters;
- a phone-as-prop interface for physical play;
- a module platform for designers and publishers;
- a bridge between private player state and a real-time GM dashboard.

## Market observations

### Werewolf / Mafia moderation

There are existing moderator apps for Werewolf and Mafia. The strongest products handle:

- role assignment;
- night/day phase flow;
- voice narration;
- timers;
- some voting and elimination logic;
- web joining from player phones in some cases.

The gap for Ludovive is not "can an app run Werewolf?" but:

- generic importable games, not one social deduction ruleset;
- persistent state and status effects beyond night/day role calls;
- gestures and phone-to-phone interactions;
- real-world zone mapping;
- broader semi-LARP and live social games;
- structured GM dashboard and audit log;
- later AI help that respects hidden information.

### Table-first character sheets and GM dashboards

There are many sheet tools and VTTs:

- D&D Beyond;
- Roll20;
- Foundry VTT;
- Demiplane;
- Shard Tabletop;
- Character Sheet Online;
- Quest Portal;
- generic mobile sheet apps.

They usually solve:

- building a character;
- tracking stats and inventory;
- rolling dice;
- sharing sheets with a GM or campaign;
- sometimes live sync or VTT integration.

But Ludovive is not looking for "online character sheets" in the usual sense. The target is not a document hosted on the web. The target is a **table-first active sheet**: a mobile control surface used during an in-person session, while the GM receives clean, structured, real-time data.

The repeated gap is ergonomics during live table play:

- players still search for the right field, checkbox, condition, or resource;
- sheets are often document-like rather than action-like;
- the GM dashboard often shows sheets, but does not always receive structured "I used this power, apply this status, update this hidden clock" events;
- most tools are system-specific, sheet-template-specific, or VTT-centric;
- AI features, when present, are often narrative or note-taking rather than rule-state enforcement.

Ludovive should treat the sheet as a dynamic control surface:

- show only relevant actions for the current phase, role, zone, and state;
- convert rule text into buttons, gestures, timers, prompts, and state transitions;
- transmit structured events to the GM dashboard;
- avoid making players hunt for checkboxes.

For table play, the design target is:

- the player uses the phone as a quick-access play aid, not as a screen to read for minutes;
- the GM sees every relevant state change in one dashboard;
- player-facing controls are contextual and short-lived;
- conditions, wounds, resources, cooldowns, secrets, debts, clocks, objectives, and permissions are all modeled as state;
- the app records what changed, who changed it, why, and whether it came from a rule, a player request, a gesture, or a GM override;
- the GM can inspect all data without asking players to recite their sheet;
- optional hidden fields can remain hidden from other players while still being visible to the GM when the module allows it.

## Licence options

### Option A: Open core

Recommended default.

- Core engine and module schema: open source.
- Official mobile app, hosted backend, premium modules, publisher tools, and Mandragore integration: commercial.

Pros:

- encourages module creation;
- attractive for hobby communities;
- allows publishers to trust the format;
- supports public funding and grants.

Cons:

- requires a clear boundary between open and paid features;
- needs governance around contributed modules.

Suggested licences:

- Core code: AGPL-3.0 if hosted derivatives should remain open, or MPL-2.0 if a more permissive ecosystem is preferred.
- Module schema: CC0 or permissive licence.
- Official modules: licence per publisher/game.

### Option B: Source-available commercial

- Code visible but not freely reusable.
- Easier commercial control.
- Less community-friendly.

This is weaker if the goal is to become a module ecosystem.

### Option C: Fully proprietary

- App and backend closed.
- Modules distributed through a marketplace.

This may work commercially, but it reduces trust and makes community modules harder.

## Revenue streams

Possible revenue streams:

- hosted sessions above a free threshold;
- premium GM tools;
- paid publisher modules;
- revenue share on commercial modules;
- organization licences for festivals, conventions, schools, associations, and companies;
- white-label event versions;
- Android app paid unlock or subscription;
- Mandragore AI credits as a late-stage optional feature.

## Recommended first model

Start with:

- free self-hostable core prototype;
- public module format;
- official hosted version later;
- free basic Android app during alpha;
- paid hosted features after playtests prove value;
- paid/premium modules only after the module format stabilizes.

Do not monetize Mandragore early. It should arrive at the end as a premium accelerator, not as the foundation of the product.

## Product implication

Ludovive's moat is not the character sheet. It is the combination of:

- rules as executable state;
- private/public visibility control;
- GM audit and override;
- physical phone interactions;
- location/zone effects;
- importable modules;
- late AI assistant with anti-spoiler constraints.
