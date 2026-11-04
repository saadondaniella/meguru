import { Component, DestroyRef, inject, input, signal } from '@angular/core';

type ShareStatus = 'copied' | 'failed' | null;

@Component({
  selector: 'app-share-button',
  templateUrl: './share-button.html',
  styleUrl: './share-button.css',
})
export class ShareButton {
  private destroyRef = inject(DestroyRef);
  private resetTimer: ReturnType<typeof setTimeout> | undefined;

  readonly title = input.required<string>();
  readonly url = input.required<string>();
  readonly text = input('');

  readonly status = signal<ShareStatus>(null);

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.resetTimer));
  }

  async share() {
    const url = this.url();

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: this.title(), text: this.text(), url });
        return;
      } catch (error) {
        // The visitor closed the share sheet: nothing to do.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    this.showStatus((await this.copy(url)) ? 'copied' : 'failed');
  }

  private async copy(url: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return this.copyWithTextarea(url);
    }
  }

  // Fallback for insecure contexts and browsers without the async clipboard API.
  private copyWithTextarea(url: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }

  private showStatus(status: ShareStatus) {
    clearTimeout(this.resetTimer);
    this.status.set(status);
    this.resetTimer = setTimeout(() => this.status.set(null), 3000);
  }
}
