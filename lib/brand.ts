// Central registry for the brand sticker library in /public/brand/parts.
// Keeps asset paths in one place so pages don't hardcode strings.

const PARTS = "/brand/parts";

export const objects = {
  cassette: `${PARTS}/cassette.png`,
  vhsTape: `${PARTS}/vhs-tape.png`,
  crtTv: `${PARTS}/crt-tv.png`,
  arcade: `${PARTS}/arcade.png`,
  boombox: `${PARTS}/boombox.png`,
  controller: `${PARTS}/controller.png`,
  joystick: `${PARTS}/joystick.png`,
  lightning: `${PARTS}/lightning.png`,
  floppy: `${PARTS}/floppy.png`,
  gameboy: `${PARTS}/gameboy.png`,
  watch: `${PARTS}/watch.png`,
  star: `${PARTS}/star.png`,
  blob: `${PARTS}/blob.png`,
} as const;

export const logos = {
  primary: `${PARTS}/logos/logo-primary.png`,
  club: `${PARTS}/logos/logo-club.png`,
  mixtape: `${PARTS}/logos/logo-mixtape.png`,
} as const;

export const stamps = {
  yeehaw: `${PARTS}/stamps/stamp-yeehaw.png`,
  new: `${PARTS}/stamps/stamp-new.png`,
  bonusTrack: `${PARTS}/stamps/stamp-bonus-track.png`,
  goodStuff: `${PARTS}/stamps/stamp-good-stuff.png`,
  nowPlaying: `${PARTS}/stamps/stamp-now-playing.png`,
  powerUp: `${PARTS}/stamps/stamp-power-up.png`,
  weirdFind: `${PARTS}/stamps/stamp-weird-find.png`,
  fieldNote: `${PARTS}/stamps/stamp-field-note.png`,
  rewind: `${PARTS}/stamps/stamp-rewind.png`,
} as const;

export type StampKey = keyof typeof stamps;
