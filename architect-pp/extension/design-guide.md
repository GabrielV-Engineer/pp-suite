# Design guide for interface mockups

The base that `/pp-design ui` follows when it draws a project's screens. It is short on purpose: it makes every mockup
decided rather than defaulted, and it works with nothing else installed. When the person has design skills installed (for
example `frontend-design`, a taste or anti-template skill, or a library of reference design documents), use them as well,
and name them in `design_skills` in `.architect/ui.md`.

Written for pp-suite. Its ideas come from reading three design skills and from what went wrong in the first real project;
no text is copied from any of them:

- `frontend-design`, published with its own Apache 2.0 licence: ground the look in the subject, plan tokens before code,
  spend boldness in one place.
- A taste and anti-template skill ("tasteskill"): measure the defaults that make a screen look generated, treat app
  screens differently from pages, look at the render and fix it.
- [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) (MIT): a design document that states its tokens and
  rules precisely enough for an agent to follow.

## 1. Decide the direction before drawing

Write down, in `## Visual system`, four things the person agreed to in the interview:

- **Subject and user.** What the product is for and who sits in front of it, for how long. A tool used for an hour at a
  time (reading a transcript) wants calm and legibility; a tool glanced at wants density.
- **Kind of screen.** An app screen is worked in (lists, forms, panels, settings); a page is read and scrolled (a
  landing or marketing page). App screens are quiet: colour marks data and the one action, not the frame. Most projects
  that reach pp-suite are app screens.
- **One reference.** A product, a document or a design file the person likes, named, so "calm" means something shared.
- **Where the boldness goes.** One thing that makes this product recognisable (a colour for its main object, a
  typeface, the layout of its main screen). Everything else stays plain.

## 2. Tokens first

Define the visual system as CSS variables before any screen, in light and dark:

- Colour: a ground, a raised surface one tone step away, the text, a muted text, a border, the primary (the one action)
  and the colour that sits on it, an error, and any colour the data needs (each with a meaning: "therapist turns", not
  "blue 2").
- Type: one family, two at most; a base of 16 px or more for text that is read for long; three to five sizes in all.
- Space: one step (4 or 8 px) and its multiples; the gap between groups clearly larger than the gap inside one.
- Radius and elevation: decided once. Things at rest are separated by tone or space, not shadows; only what floats (a
  menu, a dialog) has one.

## 3. Contrast is checked for every pair, not for an example

List in `## Accessibility` every pair of text and background the tokens can produce, in light and in dark, with its
ratio: text on ground, muted on ground, text on raised, the label on the primary button, the label on the error button,
links. Body text needs 4.5:1, large text and controls 3:1 (WCAG 2.2 AA unless the person chose another level). The first
real project passed a contrast criterion that named two pairs while its primary and danger buttons were at 2.1:1 and 2.8:1.

## 4. A screen has one job

- One `h1` that is a noun: the screen's object (the patient's name) or the screen's name.
- One primary action. Secondary actions are quieter; destructive ones ask for confirmation in words that say what is lost.
- The one finding that matters, under the title ("3 sessions to review"), when there is one.
- The navigation is drawn on every screen the same way, so the first mockup settles it: the first real project got its
  navigation after 22 slices and rewrote its screens for it.

## 5. Every state is drawn

Each screen in `ui.md` lists the states it has, and its mockup draws each one, in the product's voice:

- **Ready**, with real-looking content in the product's language (not lorem ipsum).
- **Loading**: what the person sees while waiting, the same layout with placeholders where the content will be.
- **Empty**: an invitation to act ("No patients yet. Create the first one.").
- **Error**: what happened and what to do, never vague and never an apology.

## 6. What makes a screen look generated

Avoid these unless the person asked for them: content cut into identical rounded cards with the same soft shadow;
gradients as decoration; a tiny upper-case label above every heading; numbered markers on things that are not a sequence;
an icon in a tinted circle on every item; one accent word coloured in a headline; a cream ground with a terracotta
accent, or near-black with a single acid accent, chosen because nothing else was. Removing them leaves space; fill it with
the real content, not another ornament.

## 7. Words

Name things as the person knows them, not as the system is built. A button says what happens ("Delete permanently", not
"OK"), and the same action keeps its name through the flow. Sentence case, plain verbs, the product's language.

## 8. Build the mockup, then look at it

- One self-contained HTML file per screen under `.architect/ui/mockups/`, with the tokens inline, no external scripts,
  every state on the same page (each in its own labelled section), and a light/dark switch or both side by side.
- Responsive down to the smallest size in `## Sizes`; visible keyboard focus; reduced motion respected.
- If a capture tool is installed, take a screenshot at the main size and look at it before showing it: fix the three
  worst problems once. If none is, open the file yourself when your environment allows, and say you could not look
  otherwise.
