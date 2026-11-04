import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShareButton } from './share-button';

describe('ShareButton', () => {
  let fixture: ComponentFixture<ShareButton>;

  const button = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  const status = () =>
    (fixture.nativeElement.querySelector('[role="status"]') as HTMLElement).textContent?.trim();

  async function click() {
    button().click();
    await fixture.whenStable();
  }

  function setNavigator(props: { share?: unknown; clipboard?: unknown }) {
    Object.defineProperty(navigator, 'share', { value: props.share, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: props.clipboard, configurable: true });
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [ShareButton] });
    fixture = TestBed.createComponent(ShareButton);
    fixture.componentRef.setInput('title', 'Linen shirt');
    fixture.componentRef.setInput('url', 'https://example.test/listings/1');
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.useRealTimers();
    setNavigator({});
  });

  it('is a labelled native button', () => {
    expect(button().getAttribute('aria-label')).toBe('Share this listing');
  });

  it('uses the native share sheet when available', async () => {
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn();
    setNavigator({ share, clipboard: { writeText } });

    await click();

    expect(share).toHaveBeenCalledWith({
      title: 'Linen shirt',
      text: '',
      url: 'https://example.test/listings/1',
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(status()).toBe('');
  });

  it('does nothing when the visitor cancels the share sheet', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('cancelled', 'AbortError');
    });
    const writeText = vi.fn();
    setNavigator({ share, clipboard: { writeText } });

    await click();

    expect(writeText).not.toHaveBeenCalled();
    expect(status()).toBe('');
  });

  it('copies the link and confirms it, then clears the message', async () => {
    const writeText = vi.fn(async () => undefined);
    setNavigator({ clipboard: { writeText } });

    // Fake timers only after rendering: Angular's own scheduling relies on real ones.
    vi.useFakeTimers();
    await fixture.componentInstance.share();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledWith('https://example.test/listings/1');
    expect(status()).toBe('Link copied');

    vi.advanceTimersByTime(3000);
    fixture.detectChanges();

    expect(status()).toBe('');
  });

  it('falls back to copying when sharing fails', async () => {
    const share = vi.fn(async () => {
      throw new Error('not allowed');
    });
    const writeText = vi.fn(async () => undefined);
    setNavigator({ share, clipboard: { writeText } });

    await click();

    expect(status()).toBe('Link copied');
  });

  it('falls back to execCommand when the clipboard API fails', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied');
    });
    setNavigator({ clipboard: { writeText } });
    document.execCommand = vi.fn(() => true);

    await click();

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(status()).toBe('Link copied');
  });

  it('reports a failure when nothing can copy', async () => {
    setNavigator({ clipboard: undefined });
    document.execCommand = vi.fn(() => false);

    await click();

    expect(status()).toBe('Could not copy link');
  });
});
