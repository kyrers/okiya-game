import { expect, test, type Locator, type Page } from '@playwright/test';
import { LONG_NAMES, boardCodes } from './helpers';

/**
 * Every control a player needs, reached with a real tap (or click) at the sizes most at risk: no
 * `force`, so Playwright's own checks apply to each one (visible, steady, enabled, and the topmost
 * thing under the finger). The layout sweep measures where things are; this proves they can be
 * used there. Two complete matches per size: two players with victory points, then the computer.
 */
const PHONES_AND_TABLETS: [number, number][] = [
  [320, 568], [360, 640], [390, 780], [430, 932],
  [568, 320], [667, 375], [734, 343], [844, 390], [932, 430],
  [768, 1024], [1024, 768],
];
const DESKTOPS: [number, number][] = [[1024, 640], [1440, 900], [1920, 1080]];

function sizesFor(project: string): [number, number][] {
  if (project === 'iphone-15' || project === 'pixel-7') return PHONES_AND_TABLETS;
  // A desktop browser window made as small as a phone, with a mouse.
  if (project === 'desktop-chrome') return [...DESKTOPS, ...PHONES_AND_TABLETS];
  if (project === 'desktop-firefox' || project === 'desktop-safari') return DESKTOPS;
  return [];
}

/** Waits until the board takes a tap from a person, or the game is over. */
async function waitForTurn(page: Page): Promise<'turn' | 'over'> {
  let state: 'turn' | 'over' | 'wait' = 'wait';
  await expect
    .poll(
      async () => {
        state = await page.evaluate(() => {
          const game = document.querySelector('.game');
          if (!game) return 'wait';
          if (game.classList.contains('is-over')) return 'over';
          const ready = !game.hasAttribute('data-busy') && !document.querySelector('.say-order.thinking') && document.querySelector('.game .cell.legal');
          return ready ? 'turn' : 'wait';
        });
        return state;
      },
      { timeout: 15_000 },
    )
    .not.toBe('wait');
  return state as 'turn' | 'over';
}

test.describe('every control reachable by a real tap @sweep', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  for (let i = 0; i < DESKTOPS.length + PHONES_AND_TABLETS.length; i++) {
    test(`size ${i + 1}: set up, play two whole matches, menu, rules, home, restart`, async ({ page, hasTouch }, info) => {
      const size = sizesFor(info.project.name)[i];
      test.skip(!size, 'phones and tablets in one WebKit and one Chromium project; desktops in the three desktop browsers');
      test.setTimeout(120_000);
      const [w, h] = size;
      info.annotations.push({ type: 'size', description: `${w} x ${h}` });
      await page.setViewportSize({ width: w, height: h });
      const act = async (target: Locator) => {
        if (hasTouch) await target.tap();
        else await target.click();
      };
      const dialog = (name: string | RegExp) => page.getByRole('dialog', { name });

      const playToEnd = async (): Promise<void> => {
        for (let move = 0; move < 17; move++) {
          if ((await waitForTurn(page)) === 'over') return;
          const before = (await boardCodes(page)).join();
          await act(page.locator('.game .cell.legal').first());
          await expect.poll(async () => (await boardCodes(page)).join()).not.toBe(before);
        }
        throw new Error('the game did not end within 16 moves');
      };

      await page.goto('/');
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Okiya' })).toBeVisible();

      // Two players, victory points to 10, set up entirely by taps.
      await act(page.getByRole('button', { name: /New game/ }));
      const setup = dialog('New game');
      await act(setup.getByText('A friend, on this device'));
      const name1 = setup.locator('input[name="name1"]');
      await act(name1);
      await name1.fill('Diogo');
      const name2 = setup.locator('input[name="name2"]');
      await act(name2);
      // The longest name the form takes, with no space to break at.
      await name2.fill(LONG_NAMES[1]);
      await act(setup.getByText('Victory points'));
      await act(setup.getByText('10 points'));
      await act(page.getByRole('button', { name: 'Start' }));
      await expect(page.locator('.game')).toBeVisible();
      await expect(page.locator('.seat-1 .seat-name')).toHaveText('Diogo');
      await expect(page.locator('.seat-2 .seat-name')).toHaveText(LONG_NAMES[1]);
      // Between two people at one screen there is no undo.
      await expect(page.getByRole('button', { name: 'Undo' })).toBeHidden();

      await playToEnd();
      const next = page.locator('.say-actions [data-action="next"]');
      if (await next.count()) await act(next);
      else await act(page.locator('.say-actions [data-action="again"]'));
      await expect(page.locator('.game:not(.is-over)')).toBeVisible();

      // The menu, the rules and back, home and back.
      await act(page.getByRole('button', { name: 'Menu' }));
      await act(dialog('Menu').getByRole('button', { name: 'How to play' }));
      await act(dialog('How to play').getByRole('button', { name: 'Close' }));
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await act(page.getByRole('button', { name: 'Menu' }));
      await act(dialog('Menu').getByRole('button', { name: /^Home/ }));
      await act(page.getByRole('button', { name: /Continue/ }));
      await expect(page.locator('.game')).toBeVisible();

      // Restart, through its confirmation.
      await act(page.getByRole('button', { name: 'Menu' }));
      await act(dialog('Menu').getByRole('button', { name: 'Restart the match' }));
      await act(dialog('Restart the match?').getByRole('button', { name: 'Restart' }));
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect((await boardCodes(page)).some((c) => c === 'p1' || c === 'p2')).toBe(false);

      // Against the computer, Easy, a single game, played to its end; then home.
      await act(page.getByRole('button', { name: 'Menu' }));
      await act(dialog('Menu').getByRole('button', { name: /^Home/ }));
      await act(page.getByRole('button', { name: /New game/ }));
      await act(setup.getByText('The computer'));
      await act(setup.getByText('Easy'));
      await act(setup.getByText('Single game'));
      await act(page.getByRole('button', { name: 'Start' }));
      // A match is saved, so starting another asks first.
      await act(dialog('Start a new game?').getByRole('button', { name: 'Start new game' }));
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await playToEnd();
      await act(page.locator('.say-actions [data-action="home"]'));
      await expect(page.getByRole('heading', { name: 'Okiya' })).toBeVisible();
    });
  }
});
