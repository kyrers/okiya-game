---
version: 1
slug: "src-ui-game-ts"
primary_target: "src/ui/game.ts"
related_targets: ["index.html","src/ui/styles.css"]
---

# Game screen (and the screens around it)

Scope: the whole app is one surface family: home (setup and continue), the game screen, the
end-of-game and end-of-match results, the rules sheet, settings. Visitor mode: Experience (the
game leads; the interface recedes), with Operate rigor for setup, settings and rules.

Audience and job: two people sharing one device, or one person against the computer, playing
Okiya by the official rules on a phone, tablet or desktop. Constraints: hot-seat on one shared
screen in one orientation; the liked SVG tiles are kept; flawless at every viewport.

Chosen structure: Two halves (user locked it on the decision page, round 2).
Memorable moment: the light crossing the seam from one half to the other when the turn passes.

## Direction contract

THESIS: The game is a table shared by two people. The screen splits into a vermilion half and an
indigo half, the garden straddles the seam, and the half whose turn it is lights up. Refuses the
category default: a board floating on a neutral page with a status bar and side panels.

OWN-WORLD: Two dyed cloth grounds, vermilion (player 1, patterned tokens) and indigo (player 2,
plain tokens); the waiting half sinks to a muted, darker dye, the moving half is full and lit. On
the seam, a warm paper garden board holding the liked SVG tiles; lacquered tokens. Shippori
Mincho B1 for display, Zen Kaku Gothic New for everything else. Authored SVG icons only.

STORY: At a glance players know whose turn it is (the lit half), what they may take (the taken
tile and order in the mover's half, the playable tiles lifted), and how a game ended (the
formation brushed across the garden, the result on the winner's half). They take a tile; the
light crosses the seam.

FIRST VIEWPORT: Portrait: the indigo half on top (menu at its corner, name, eight token pips,
match score), the garden centred on the seam at nearly full width, the vermilion half below.
The mover's half shows the taken tile with "Take a cherry or bird tile". Landscape and desktop:
vermilion half left, indigo right, garden centred on the vertical seam, same contents per half.

FORM: Two halves, second of three dealt from the re-rolled list; seed key 836af164.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction and motion grammar (code-led build, no comp): the turn light sweeps across
the seam (about 450 ms, exponential ease-out); a taken tile lifts out of the garden and flies to
the mover's taken-tile slot; the token drops into the empty cell with a short settle. All three
collapse to instant state changes under prefers-reduced-motion.

## Unresolved

- App icon and social image: drawn from the same world at build time.
