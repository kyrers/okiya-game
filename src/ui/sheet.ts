/**
 * Sheets and confirmations, built on the native <dialog> element: it traps focus, closes on Escape
 * and makes the page behind it inert. A bottom sheet on phones, a centred panel on wider screens.
 */
import { icon } from './art';

export interface Sheet {
  readonly dialog: HTMLDialogElement;
  readonly body: HTMLElement;
  close(): void;
}

export interface SheetOptions {
  title: string;
  body: Node | string;
  className?: string;
  /** Fixed area under the scrolling body, for the sheet's main action. */
  footer?: Node;
  /** Element to focus when the sheet opens; defaults to the panel itself. */
  initialFocus?: (body: HTMLElement) => HTMLElement | null;
  onClose?: () => void;
}

let seq = 0;

export function openSheet(opts: SheetOptions): Sheet {
  const opener = document.activeElement as HTMLElement | null;
  const id = `sheet-title-${++seq}`;
  const dialog = document.createElement('dialog');
  dialog.className = `sheet ${opts.className ?? ''}`.trim();
  dialog.setAttribute('aria-labelledby', id);
  dialog.innerHTML = `
    <div class="sheet-panel" tabindex="-1">
      <header class="sheet-head">
        <h2 id="${id}" class="sheet-title"></h2>
        <button type="button" class="icon-btn sheet-close" aria-label="Close">${icon('close')}</button>
      </header>
      <div class="sheet-body"></div>
    </div>`;
  dialog.querySelector('.sheet-title')!.textContent = opts.title;
  const body = dialog.querySelector<HTMLElement>('.sheet-body')!;
  if (typeof opts.body === 'string') body.innerHTML = opts.body;
  else body.append(opts.body);
  if (opts.footer) {
    const foot = document.createElement('footer');
    foot.className = 'sheet-foot';
    foot.append(opts.footer);
    dialog.querySelector('.sheet-panel')!.append(foot);
  }
  document.body.append(dialog);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (dialog.open) dialog.close();
    dialog.remove();
    opts.onClose?.();
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
  };
  dialog.querySelector('.sheet-close')!.addEventListener('click', close);
  dialog.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    close();
  });
  // A click on the backdrop lands on the dialog element itself, outside the panel.
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) close();
  });
  dialog.showModal();
  // Focus the panel, not its first control: no stray focus ring for touch users, and Tab
  // still walks straight into the sheet.
  const first = opts.initialFocus?.(body) ?? dialog.querySelector<HTMLElement>('.sheet-panel');
  first?.focus({ preventScroll: true });
  body.scrollTop = 0;
  return { dialog, body, close };
}

export function confirmSheet(title: string, message: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    const body = document.createElement('div');
    body.className = 'confirm';
    body.innerHTML = `<p></p>
      <div class="confirm-actions">
        <button type="button" class="btn ghost" data-answer="no">Cancel</button>
        <button type="button" class="btn primary" data-answer="yes"></button>
      </div>`;
    body.querySelector('p')!.textContent = message;
    body.querySelector('[data-answer="yes"]')!.textContent = confirmLabel;
    const sheet = openSheet({
      title,
      body,
      className: 'sheet-confirm',
      initialFocus: (b) => b.querySelector('[data-answer="no"]'),
      onClose: () => resolve(answer),
    });
    body.addEventListener('click', (ev) => {
      const a = (ev.target as Element).closest<HTMLElement>('[data-answer]')?.dataset.answer;
      if (!a) return;
      answer = a === 'yes';
      sheet.close();
    });
  });
}
